//! Note → spaced-repetition cards, in a SEPARATE app-owned store.
//!
//! The single-writer-for-mastery invariant says only the assess/capstone skills
//! write `manifest.review_queue`. Notebook flashcards must NOT breach that — so
//! they live in their own `learning/<slug>/notebooks/cards.json` (a plain
//! `Vec<ReviewItem>`) and are scheduled by reusing the PURE `lyceum_core::srs`
//! functions over that slice. The manifest is never opened here.
//!
//! Cards are DERIVED from a note's cloze markup (`==answer==`). Each cloze on a
//! line becomes one card whose prompt is the line with that answer blanked. Card
//! ids are `"<noteId>#<n>"` (document order), so re-saving a note reconciles its
//! cards in place — unchanged clozes keep their Leitner box/due, edited ones keep
//! their schedule with new text, removed ones are dropped.

use std::path::Path;

use serde::Serialize;
use time::Date;

use lyceum_core::model::{Box_, ModuleId, ReviewId, ReviewItem};
use lyceum_core::srs::{self, preview_interval_days, Grade};

use crate::delete::{contained_path, validate_slug};
use crate::error::{AppError, AppResult};

const BLANK: &str = "____";

// ---------------------------------------------------------------------------
// Cloze parsing (pure)
// ---------------------------------------------------------------------------

/// The `==answer==` spans on one line as `(start, end_exclusive, inner)`. An
/// unmatched `==` (no closing pair) ends the scan for that line; an empty `====`
/// is skipped. This is the graceful-degrade contract: malformed markup yields no
/// card rather than an error.
fn line_clozes(line: &str) -> Vec<(usize, usize, String)> {
    let mut spans = Vec::new();
    let mut from = 0;
    while let Some(open_rel) = line[from..].find("==") {
        let open = from + open_rel;
        let after = open + 2;
        let Some(close_rel) = line[after..].find("==") else {
            break; // unmatched opener -> ignore the rest of the line
        };
        let close = after + close_rel;
        let inner = line[after..close].to_string();
        let end = close + 2;
        if !inner.trim().is_empty() {
            spans.push((open, end, inner));
        }
        from = end;
    }
    spans
}

/// Render the prompt for cloze `j` on a line: that span becomes `____`, the other
/// clozes show their answer text (markers stripped), the rest is verbatim.
fn render_prompt(line: &str, spans: &[(usize, usize, String)], j: usize) -> String {
    let mut out = String::new();
    let mut cursor = 0;
    for (k, (s, e, inner)) in spans.iter().enumerate() {
        out.push_str(&line[cursor..*s]);
        out.push_str(if k == j { BLANK } else { inner });
        cursor = *e;
    }
    out.push_str(&line[cursor..]);
    out.trim().to_string()
}

/// All cards a note's content yields, in document order: `(card_id, prompt, answer)`.
fn derive_cards(note_id: &str, content: &str) -> Vec<(ReviewId, String, String)> {
    let mut cards = Vec::new();
    let mut n = 0usize;
    for line in content.lines() {
        let spans = line_clozes(line);
        for j in 0..spans.len() {
            let answer = spans[j].2.trim().to_string();
            let prompt = render_prompt(line, &spans, j);
            cards.push((ReviewId(format!("{note_id}#{n}")), prompt, answer));
            n += 1;
        }
    }
    cards
}

// ---------------------------------------------------------------------------
// Store IO (app-owned cards.json — NOT the manifest)
// ---------------------------------------------------------------------------

fn cards_path(ws: &Path, slug: &str) -> AppResult<std::path::PathBuf> {
    contained_path(ws, slug, "notebooks/cards.json")
}

fn load_cards(ws: &Path, slug: &str) -> AppResult<Vec<ReviewItem>> {
    let path = cards_path(ws, slug)?;
    match std::fs::read_to_string(&path) {
        Ok(raw) => Ok(serde_json::from_str(&raw)?),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(Vec::new()),
        Err(e) => Err(e.into()),
    }
}

fn save_cards(ws: &Path, slug: &str, cards: &[ReviewItem]) -> AppResult<()> {
    let path = cards_path(ws, slug)?;
    if let Some(parent) = path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&path, serde_json::to_string_pretty(cards)?)?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Reconcile / prune (called by notebook.rs on note save / delete)
// ---------------------------------------------------------------------------

/// Re-derive a note's cards and merge them into the store: keep other notes' cards
/// untouched; for this note, preserve the Leitner schedule of a card whose id still
/// exists (updating its prompt/answer/module), create new cards at box 1 due today,
/// and drop cards whose cloze was removed. Never touches the manifest.
pub fn reconcile_cards(
    ws: &Path,
    slug: &str,
    note_id: &str,
    content: &str,
    module_id: Option<&str>,
    today: Date,
) -> AppResult<()> {
    validate_slug(slug)?;
    let derived = derive_cards(note_id, content);
    let store = load_cards(ws, slug)?;
    let mid = module_id.map(|m| ModuleId(m.to_string()));
    let prefix = format!("{note_id}#");

    // Start from every OTHER note's cards (this note's are fully re-derived).
    let mut next: Vec<ReviewItem> = store
        .iter()
        .filter(|c| !c.item_id.0.starts_with(&prefix))
        .cloned()
        .collect();

    for (id, prompt, answer) in derived {
        match store.iter().find(|c| c.item_id == id) {
            Some(existing) => next.push(ReviewItem {
                prompt,
                answer,
                module_id: mid.clone(),
                ..existing.clone() // keep box/due/last_result/lapses + item_id
            }),
            None => next.push(ReviewItem {
                item_id: id,
                prompt,
                answer,
                module_id: mid.clone(),
                box_: Box_::N(1),
                due: today,
                last_result: None,
                lapses: 0,
            }),
        }
    }

    // Only write when the store actually changed (avoid creating an empty file for
    // a note with no clozes when none existed before).
    if next != store {
        save_cards(ws, slug, &next)?;
    }
    Ok(())
}

/// Drop all of a note's cards (called when the note is deleted). Idempotent.
pub fn prune_cards(ws: &Path, slug: &str, note_id: &str) -> AppResult<()> {
    validate_slug(slug)?;
    let store = load_cards(ws, slug)?;
    let prefix = format!("{note_id}#");
    let next: Vec<ReviewItem> = store
        .iter()
        .filter(|c| !c.item_id.0.starts_with(&prefix))
        .cloned()
        .collect();
    if next.len() != store.len() {
        save_cards(ws, slug, &next)?;
    }
    Ok(())
}

// ---------------------------------------------------------------------------
// Review surface (mirrors service::review_due/grade_review, over the card store)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GradePreview {
    pub again: i64,
    pub hard: i64,
    pub good: i64,
    pub easy: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CardCandidate {
    pub item_id: String,
    pub prompt: String,
    pub answer: String,
    pub module_id: Option<String>,
    pub box_num: Option<u8>,
    pub preview: GradePreview,
}

fn to_candidate(it: &ReviewItem) -> CardCandidate {
    CardCandidate {
        item_id: it.item_id.0.clone(),
        prompt: it.prompt.clone(),
        answer: it.answer.clone(),
        module_id: it.module_id.as_ref().map(|m| m.0.clone()),
        box_num: it.box_.number(),
        preview: GradePreview {
            again: preview_interval_days(it, Grade::Again),
            hard: preview_interval_days(it, Grade::Hard),
            good: preview_interval_days(it, Grade::Good),
            easy: preview_interval_days(it, Grade::Easy),
        },
    }
}

/// The due card batch for a subject (most-overdue-first, interleaved by module).
/// `module_id = Some(m)` scopes to one lesson's cards; `None` = the whole subject.
pub fn cards_due(
    ws: &Path,
    slug: &str,
    module_id: Option<&str>,
    today: Date,
) -> AppResult<Vec<CardCandidate>> {
    validate_slug(slug)?;
    let store = load_cards(ws, slug)?;
    let scoped: Vec<ReviewItem> = match module_id {
        Some(m) => store
            .into_iter()
            .filter(|c| c.module_id.as_ref().map(|x| x.0.as_str()) == Some(m))
            .collect(),
        None => store,
    };
    let batch = srs::select_batch(&scoped, today);
    Ok(srs::interleave(batch)
        .into_iter()
        .map(to_candidate)
        .collect())
}

/// Total due count for a subject's cards (whole store, not the capped batch) — the
/// "N due" badge. Retired/future excluded.
pub fn cards_due_count(ws: &Path, slug: &str, today: Date) -> AppResult<usize> {
    validate_slug(slug)?;
    Ok(srs::due_count(&load_cards(ws, slug)?, today))
}

/// Grade a card (schedule-only), persist the store, return the remaining due batch.
pub fn grade_card(
    ws: &Path,
    slug: &str,
    card_id: &str,
    grade: &str,
    today: Date,
) -> AppResult<Vec<CardCandidate>> {
    validate_slug(slug)?;
    let grade = crate::service::parse_grade(grade)?;
    let mut store = load_cards(ws, slug)?;
    let item = store
        .iter_mut()
        .find(|c| c.item_id.0 == card_id)
        .ok_or_else(|| AppError::msg(format!("card {card_id} not found")))?;
    srs::apply_grade(item, grade, today);
    save_cards(ws, slug, &store)?;
    Ok(srs::interleave(srs::select_batch(&store, today))
        .into_iter()
        .map(to_candidate)
        .collect())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::workspace;
    use time::macros::date;

    const D1: Date = date!(2026 - 06 - 20);
    const D2: Date = date!(2026 - 06 - 21);
    const SLUG: &str = "conversational-spanish";

    fn ws() -> tempfile::TempDir {
        let tmp = tempfile::tempdir().unwrap();
        std::fs::create_dir_all(workspace::subject_dir(tmp.path(), SLUG)).unwrap();
        tmp
    }

    // --- cloze parsing --------------------------------------------------------

    #[test]
    fn derives_one_card_per_cloze_with_blanked_prompt() {
        let cards = derive_cards("nb001", "The capital of France is ==Paris==.");
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].0 .0, "nb001#0");
        assert_eq!(cards[0].1, "The capital of France is ____.");
        assert_eq!(cards[0].2, "Paris");
    }

    #[test]
    fn multiple_clozes_one_line_blank_each_in_turn() {
        let cards = derive_cards("nb001", "==Ser== is permanent, ==estar== is temporary");
        assert_eq!(cards.len(), 2);
        assert_eq!(cards[0].1, "____ is permanent, estar is temporary");
        assert_eq!(cards[0].2, "Ser");
        assert_eq!(cards[1].1, "Ser is permanent, ____ is temporary");
        assert_eq!(cards[1].2, "estar");
    }

    #[test]
    fn malformed_and_empty_clozes_degrade_to_no_card() {
        assert!(derive_cards("nb001", "an ==unclosed marker").is_empty());
        assert!(derive_cards("nb001", "empty ==== marker").is_empty());
        assert!(derive_cards("nb001", "no markers here").is_empty());
    }

    // --- reconcile / prune ----------------------------------------------------

    #[test]
    fn reconcile_creates_cards_at_box1_due_today_and_never_writes_manifest() {
        let tmp = ws();
        reconcile_cards(tmp.path(), SLUG, "nb001", "x is ==y==", Some("m02"), D1).unwrap();
        let cards = load_cards(tmp.path(), SLUG).unwrap();
        assert_eq!(cards.len(), 1);
        assert_eq!(cards[0].box_, Box_::N(1));
        assert_eq!(cards[0].due, D1);
        assert_eq!(cards[0].module_id.as_ref().unwrap().0, "m02");
        // The invariant: notebook cards NEVER create/touch the subject manifest.
        assert!(!workspace::manifest_path(tmp.path(), SLUG).exists());
    }

    #[test]
    fn reconcile_preserves_schedule_for_unchanged_cloze_and_drops_removed() {
        let tmp = ws();
        reconcile_cards(tmp.path(), SLUG, "nb001", "a ==one== b ==two==", None, D1).unwrap();
        // Advance card #0's schedule by grading it.
        grade_card(tmp.path(), SLUG, "nb001#0", "good", D1).unwrap();
        let promoted = load_cards(tmp.path(), SLUG)
            .unwrap()
            .into_iter()
            .find(|c| c.item_id.0 == "nb001#0")
            .unwrap();
        assert_eq!(promoted.box_, Box_::N(2), "graded to box 2");

        // Re-save the note with the SECOND cloze removed: #0 keeps its box, #1 gone.
        reconcile_cards(tmp.path(), SLUG, "nb001", "a ==one== b two", None, D2).unwrap();
        let cards = load_cards(tmp.path(), SLUG).unwrap();
        assert_eq!(cards.len(), 1, "the removed cloze's card is dropped");
        let kept = &cards[0];
        assert_eq!(kept.item_id.0, "nb001#0");
        assert_eq!(
            kept.box_,
            Box_::N(2),
            "unchanged cloze keeps its Leitner box"
        );
    }

    #[test]
    fn reconcile_isolates_other_notes_cards() {
        let tmp = ws();
        reconcile_cards(tmp.path(), SLUG, "nb001", "==a==", None, D1).unwrap();
        reconcile_cards(tmp.path(), SLUG, "nb002", "==b==", None, D1).unwrap();
        // Editing nb001 must not disturb nb002's card.
        reconcile_cards(tmp.path(), SLUG, "nb001", "==a== ==c==", None, D2).unwrap();
        let ids: Vec<String> = load_cards(tmp.path(), SLUG)
            .unwrap()
            .iter()
            .map(|c| c.item_id.0.clone())
            .collect();
        assert!(ids.contains(&"nb002#0".to_string()));
        assert_eq!(ids.iter().filter(|i| i.starts_with("nb001#")).count(), 2);
    }

    #[test]
    fn prune_removes_only_the_named_notes_cards() {
        let tmp = ws();
        reconcile_cards(tmp.path(), SLUG, "nb001", "==a==", None, D1).unwrap();
        reconcile_cards(tmp.path(), SLUG, "nb002", "==b==", None, D1).unwrap();
        prune_cards(tmp.path(), SLUG, "nb001").unwrap();
        let ids: Vec<String> = load_cards(tmp.path(), SLUG)
            .unwrap()
            .iter()
            .map(|c| c.item_id.0.clone())
            .collect();
        assert_eq!(ids, vec!["nb002#0".to_string()]);
        prune_cards(tmp.path(), SLUG, "nb001").unwrap(); // idempotent
    }

    // --- review (due / grade) -------------------------------------------------

    #[test]
    fn due_and_grade_round_trip() {
        let tmp = ws();
        reconcile_cards(tmp.path(), SLUG, "nb001", "==a== ==b==", Some("m01"), D1).unwrap();
        assert_eq!(cards_due_count(tmp.path(), SLUG, D1).unwrap(), 2);
        let due = cards_due(tmp.path(), SLUG, None, D1).unwrap();
        assert_eq!(due.len(), 2);
        assert!(due[0].preview.good > 0);

        // Grade one Good -> promoted to box 2, due in 3 days -> not due today.
        let remaining = grade_card(tmp.path(), SLUG, "nb001#0", "good", D1).unwrap();
        assert_eq!(remaining.len(), 1, "graded card no longer due today");
        assert_eq!(cards_due_count(tmp.path(), SLUG, D1).unwrap(), 1);
    }

    #[test]
    fn due_can_scope_to_a_module() {
        let tmp = ws();
        reconcile_cards(tmp.path(), SLUG, "nb001", "==a==", Some("m01"), D1).unwrap();
        reconcile_cards(tmp.path(), SLUG, "nb002", "==b==", Some("m02"), D1).unwrap();
        assert_eq!(
            cards_due(tmp.path(), SLUG, Some("m01"), D1).unwrap().len(),
            1
        );
        assert_eq!(cards_due(tmp.path(), SLUG, None, D1).unwrap().len(), 2);
    }

    #[test]
    fn grade_rejects_unknown_card() {
        let tmp = ws();
        reconcile_cards(tmp.path(), SLUG, "nb001", "==a==", None, D1).unwrap();
        assert!(grade_card(tmp.path(), SLUG, "nb999#0", "good", D1).is_err());
    }
}
