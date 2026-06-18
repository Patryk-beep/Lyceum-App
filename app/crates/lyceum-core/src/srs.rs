//! Leitner SRS scheduler — the canonical ladder from REFERENCE.md §31.
//!
//! Ship `[1,3,7,16,35,90]` days (NOT the deck's cosmetic labels): the skills write
//! to this schedule, so the app must agree exactly or every review write would fight.
//!
//! Binary pass/fail: `Again` = fail; `Hard`/`Good`/`Easy` = pass = **single-box
//! promotion** (no 2-box jumps). This is a schedule-only concern — actual quizzing
//! and interleaving are Claude's job; the app uses these for the "N due" badge,
//! the candidate set, and the deterministic review lane.

use time::Date;

use crate::date::add_days;
use crate::model::{Box_, ModuleId, ReviewItem, ReviewResult};

/// Days per Leitner box, 1-indexed (box 1 -> 1 day … box 6 -> 90 days).
pub const LADDER: [i64; 6] = [1, 3, 7, 16, 35, 90];

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Grade {
    Again,
    Hard,
    Good,
    Easy,
}

impl Grade {
    pub fn is_pass(self) -> bool {
        !matches!(self, Grade::Again)
    }
}

/// Interval in days for a box number (clamped to 1..=6).
pub fn interval(box_num: u8) -> i64 {
    let idx = box_num.clamp(1, 6) as usize - 1;
    LADDER[idx]
}

/// Display-only helper. NEVER feeds the schedule.
pub fn human_interval_label(b: &Box_) -> String {
    match b {
        Box_::Retired => "retired".to_string(),
        Box_::N(n) => {
            let days = interval(*n);
            if days == 1 {
                "1 day".to_string()
            } else {
                format!("{days} days")
            }
        }
    }
}

/// The interval (in days) that a grade would produce, for UI preview on the SRS
/// buttons. `Again` -> 1 (back to box 1); a pass -> the next box's interval, or
/// the box-6 interval if already at 6 (which retires after).
pub fn preview_interval_days(item: &ReviewItem, grade: Grade) -> i64 {
    match (&item.box_, grade.is_pass()) {
        (_, false) => 1,
        (Box_::Retired, true) => interval(6),
        (Box_::N(n), true) => interval((*n + 1).min(6)),
    }
}

/// Apply a grade to a review item in place (schedule-only — never touches mastery).
///
/// Pass: promote one box (`min(b+1, 6)`); from box 6 -> `Retired`; `due = today + interval`.
/// Fail: reset to box 1, `due = today + 1`, `lapses += 1`.
pub fn apply_grade(item: &mut ReviewItem, grade: Grade, today: Date) {
    if grade.is_pass() {
        item.last_result = Some(ReviewResult::Pass);
        match &item.box_ {
            Box_::N(6) => {
                item.box_ = Box_::Retired;
                item.due = add_days(today, interval(6));
            }
            Box_::N(n) => {
                let next = (n + 1).min(6);
                item.box_ = Box_::N(next);
                item.due = add_days(today, interval(next));
            }
            Box_::Retired => {
                // A retired item that is reviewed again stays retired, far out.
                item.due = add_days(today, interval(6));
            }
        }
    } else {
        item.last_result = Some(ReviewResult::Fail);
        item.box_ = Box_::N(1);
        item.due = add_days(today, 1);
        item.lapses += 1;
    }
}

/// Items due on or before `today` (retired items are never due).
pub fn due_items(queue: &[ReviewItem], today: Date) -> Vec<&ReviewItem> {
    queue
        .iter()
        .filter(|r| !matches!(r.box_, Box_::Retired) && r.due <= today)
        .collect()
}

/// Count of items due on or before `today`.
pub fn due_count(queue: &[ReviewItem], today: Date) -> usize {
    due_items(queue, today).len()
}

/// Select a review batch: most-overdue-first, clamped to [8, 15]. No topic sort.
pub fn select_batch(queue: &[ReviewItem], today: Date) -> Vec<&ReviewItem> {
    let mut due = due_items(queue, today);
    // Most overdue first (smallest `due` date first); stable on ties.
    due.sort_by_key(|r| r.due);
    let n = due.len().clamp(0, 15);
    // The clamp lower-bound [8,15] is the *target* batch size when enough are due;
    // we never pad past what is actually due.
    let take = if due.len() >= 8 { n } else { due.len() };
    due.into_iter().take(take).collect()
}

/// Greedy round-robin interleave so consecutive items rarely share a `module_id`.
pub fn interleave(items: Vec<&ReviewItem>) -> Vec<&ReviewItem> {
    let mut out: Vec<&ReviewItem> = Vec::with_capacity(items.len());
    let mut remaining: Vec<&ReviewItem> = items;
    let mut last_module: Option<ModuleId> = None;
    while !remaining.is_empty() {
        // Prefer the first item whose module differs from the last placed one.
        let pick = remaining
            .iter()
            .position(|r| r.module_id != last_module)
            .unwrap_or(0);
        let item = remaining.remove(pick);
        last_module = item.module_id.clone();
        out.push(item);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    fn item(id: &str, box_: Box_, due: Date, module: Option<&str>) -> ReviewItem {
        ReviewItem {
            item_id: crate::model::ReviewId(id.into()),
            prompt: "p".into(),
            answer: "a".into(),
            module_id: module.map(|m| ModuleId(m.into())),
            box_,
            due,
            last_result: None,
            lapses: 0,
        }
    }

    #[test]
    fn ladder_is_exact() {
        assert_eq!(LADDER, [1, 3, 7, 16, 35, 90]);
        assert_eq!(interval(1), 1);
        assert_eq!(interval(6), 90);
    }

    #[test]
    fn pass_promotes_one_box_and_sets_due() {
        let today = date!(2026 - 06 - 18);
        let mut it = item("r001", Box_::N(2), today, None);
        apply_grade(&mut it, Grade::Good, today);
        assert_eq!(it.box_, Box_::N(3));
        assert_eq!(it.due, date!(2026 - 06 - 25)); // +7
        assert_eq!(it.last_result, Some(ReviewResult::Pass));
    }

    #[test]
    fn easy_never_jumps_two_boxes() {
        let today = date!(2026 - 06 - 18);
        let mut it = item("r001", Box_::N(2), today, None);
        apply_grade(&mut it, Grade::Easy, today);
        assert_eq!(it.box_, Box_::N(3)); // single promotion, not 4
    }

    #[test]
    fn box6_pass_retires() {
        let today = date!(2026 - 06 - 18);
        let mut it = item("r001", Box_::N(6), today, None);
        apply_grade(&mut it, Grade::Good, today);
        assert_eq!(it.box_, Box_::Retired);
        assert_eq!(it.due, date!(2026 - 09 - 16)); // +90
    }

    #[test]
    fn fail_resets_to_box1_due_tomorrow_and_lapses() {
        let today = date!(2026 - 06 - 18);
        let mut it = item("r001", Box_::N(4), today, None);
        apply_grade(&mut it, Grade::Again, today);
        assert_eq!(it.box_, Box_::N(1));
        assert_eq!(it.due, date!(2026 - 06 - 19));
        assert_eq!(it.lapses, 1);
        assert_eq!(it.last_result, Some(ReviewResult::Fail));
    }

    #[test]
    fn due_excludes_retired_and_future() {
        let today = date!(2026 - 06 - 18);
        let q = vec![
            item("r001", Box_::N(1), date!(2026 - 06 - 17), None), // overdue
            item("r002", Box_::N(1), date!(2026 - 06 - 20), None), // future
            item("r003", Box_::Retired, date!(2026 - 06 - 01), None), // retired
        ];
        let due = due_items(&q, today);
        assert_eq!(due.len(), 1);
        assert_eq!(due[0].item_id.0, "r001");
    }

    #[test]
    fn select_batch_caps_at_15_most_overdue_first() {
        let today = date!(2026 - 07 - 01);
        let q: Vec<ReviewItem> = (0..20)
            .map(|i| {
                item(
                    &format!("r{i:03}"),
                    Box_::N(1),
                    date!(2026 - 06 - 01).saturating_add(time::Duration::days(i)),
                    None,
                )
            })
            .collect();
        let batch = select_batch(&q, today);
        assert_eq!(batch.len(), 15);
        // most overdue (earliest due) first
        assert_eq!(batch[0].item_id.0, "r000");
    }

    #[test]
    fn interleave_avoids_consecutive_same_module() {
        let today = date!(2026 - 06 - 18);
        let items = [
            item("r001", Box_::N(1), today, Some("m01")),
            item("r002", Box_::N(1), today, Some("m01")),
            item("r003", Box_::N(1), today, Some("m02")),
        ];
        let refs: Vec<&ReviewItem> = items.iter().collect();
        let out = interleave(refs);
        // No two consecutive share a module where avoidable.
        let mods: Vec<_> = out.iter().map(|r| r.module_id.clone()).collect();
        assert_ne!(mods[0], mods[1]);
    }
}
