//! Cross-subject "days at study" streak — a pure, tested helper. The app unions
//! every subject's `history[].date` and passes them here; civil dates only (the
//! caller decides "today", which is UTC at the app layer — documented there).

use std::collections::BTreeSet;

use serde::Serialize;
use time::Date;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StreakInfo {
    pub current: u32,
    pub longest: u32,
    pub last_active: Option<String>,
}

/// Consecutive study-days ending at (or just before) `today`. Dedups multi-event
/// days. If `today` has no entry but yesterday does, the streak still counts from
/// yesterday (a fresh morning before studying doesn't reset it). Empty -> 0.
pub fn current_streak(dates: &[Date], today: Date) -> u32 {
    if dates.is_empty() {
        return 0;
    }
    let set: BTreeSet<Date> = dates.iter().copied().collect();

    let mut cursor = today;
    if !set.contains(&cursor) {
        match cursor.previous_day() {
            Some(yest) if set.contains(&yest) => cursor = yest,
            _ => return 0,
        }
    }

    let mut count = 0u32;
    while set.contains(&cursor) {
        count += 1;
        match cursor.previous_day() {
            Some(p) => cursor = p,
            None => break,
        }
    }
    count
}

/// The longest run of consecutive days anywhere in the history.
pub fn longest_streak(dates: &[Date]) -> u32 {
    let set: BTreeSet<Date> = dates.iter().copied().collect();
    let mut longest = 0u32;
    let mut run = 0u32;
    let mut prev: Option<Date> = None;
    for d in &set {
        run = match prev {
            Some(p) if p.next_day() == Some(*d) => run + 1,
            _ => 1,
        };
        longest = longest.max(run);
        prev = Some(*d);
    }
    longest
}

pub fn streak_info(dates: &[Date], today: Date) -> StreakInfo {
    let set: BTreeSet<Date> = dates.iter().copied().collect();
    StreakInfo {
        current: current_streak(dates, today),
        longest: longest_streak(dates),
        last_active: set.iter().next_back().map(|d| crate::date::format_iso(*d)),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    #[test]
    fn empty_is_zero() {
        assert_eq!(current_streak(&[], date!(2026 - 06 - 18)), 0);
        let info = streak_info(&[], date!(2026 - 06 - 18));
        assert_eq!(info.current, 0);
        assert_eq!(info.longest, 0);
        assert_eq!(info.last_active, None);
    }

    #[test]
    fn single_day_today_is_one() {
        let today = date!(2026 - 06 - 18);
        assert_eq!(current_streak(&[today], today), 1);
    }

    #[test]
    fn a_gap_breaks_the_streak() {
        let today = date!(2026 - 06 - 18);
        // today, today-1, then a gap, then today-3
        let dates = [today, date!(2026 - 06 - 17), date!(2026 - 06 - 15)];
        assert_eq!(current_streak(&dates, today), 2);
        assert_eq!(longest_streak(&dates), 2); // 16-15? no: 15 then 17,18 -> run of 2
    }

    #[test]
    fn today_missing_but_yesterday_present_counts_from_yesterday() {
        let today = date!(2026 - 06 - 18);
        let dates = [date!(2026 - 06 - 17), date!(2026 - 06 - 16)];
        assert_eq!(current_streak(&dates, today), 2);
    }

    #[test]
    fn day_before_yesterday_only_is_zero() {
        let today = date!(2026 - 06 - 18);
        // neither today nor yesterday -> streak is 0 (not counting older runs)
        let dates = [date!(2026 - 06 - 16), date!(2026 - 06 - 15)];
        assert_eq!(current_streak(&dates, today), 0);
    }

    #[test]
    fn same_date_across_subjects_counts_once() {
        let today = date!(2026 - 06 - 18);
        // duplicate "today" from two subjects + yesterday
        let dates = [today, today, date!(2026 - 06 - 17)];
        assert_eq!(current_streak(&dates, today), 2);
    }
}
