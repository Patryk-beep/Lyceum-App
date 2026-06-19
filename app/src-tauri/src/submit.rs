//! Student hand-in / submission. Writes the learner's answer to a file and flips
//! the assignment `open → submitted` — the exact transition that makes the engine
//! route to `assess-understanding` (see `routing.rs` / `prompts.rs`). The hard
//! rules, mirrored from `delete.rs`:
//!   - **validate the slug** + **contain the path** before any filesystem touch.
//!   - **write the submission file BEFORE saving the manifest**, so the
//!     `submissionFile` pointer never references a file that was not written (the
//!     inverse of delete's manifest-first ordering — an orphan file is benign, a
//!     dangling pointer is the break).
//!   - **app-writable surface only**: status, the submission pointer, `submittedAt`,
//!     `history`, and the advisory `current.phase`. NEVER `objective.mastery`,
//!     module status, or `certification` — those stay with the assess/capstone
//!     skills (single-writer-for-mastery).

use std::path::Path;

use time::Date;

use lyceum_core::model::{
    AssignmentStatus, CurrentStatus, HistoryEntry, Manifest, ModuleStatus, Phase,
};
use lyceum_core::routing::derive_route;
use lyceum_core::store;

use crate::delete::{contained_path, halt_if_invalid, route_to_phase, validate_slug};
use crate::error::{AppError, AppResult};
use crate::workspace;

/// Persist the learner's answer to `submissions/<assignmentId>.md`, point the
/// manifest entry at it, flip `open → submitted`, and realign the advisory phase to
/// the freshly derived route (now `Assess`). The UI then runs the next engine step,
/// which grades it. A `graded` assignment is inert (its grade is authoritative) — we
/// refuse to overwrite it. Mastery, modules, and the review queue are untouched.
pub fn submit_assignment(
    ws: &Path,
    slug: &str,
    assignment_id: &str,
    content: &str,
    today: Date,
) -> AppResult<Manifest> {
    validate_slug(slug)?;
    let path = workspace::manifest_path(ws, slug);
    let mut manifest = store::load(&path)?;

    let idx = manifest
        .assignments
        .iter()
        .position(|a| a.id.0 == assignment_id)
        .ok_or_else(|| AppError::msg(format!("assignment {assignment_id} not found")))?;

    if manifest.assignments[idx].status == AssignmentStatus::Graded {
        return Err(AppError::msg(
            "assignment is already graded — see its feedback",
        ));
    }

    // Guard the path, then write the file FIRST (pointer must never dangle).
    let rel = format!("submissions/{assignment_id}.md");
    let file_path = contained_path(ws, slug, &rel)?;
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&file_path, content)?;

    let module_id = manifest.assignments[idx].module_id.clone();
    {
        let a = &mut manifest.assignments[idx];
        a.status = AssignmentStatus::Submitted;
        a.submission_file = Some(rel);
        a.submitted_at = Some(today);
    }

    manifest.history.push(HistoryEntry {
        date: today,
        skill: "app-submit".into(),
        event: format!("submitted assignment {assignment_id} for {module_id}"),
        result: String::new(),
    });

    // Routing repair: only when the assignment is on the CURRENT, non-mastered
    // module (mirror delete_assignment). Re-derive the route and match the phase.
    if manifest.current.module_id.as_ref() == Some(&module_id) {
        let on_mastered = manifest
            .modules
            .iter()
            .any(|m| m.id == module_id && m.status == ModuleStatus::Mastered);
        if !on_mastered {
            let disk = workspace::disk_state(ws, slug);
            if let Some(phase) = route_to_phase(&derive_route(&manifest, &disk).route) {
                manifest.current.phase = Some(phase);
                if !matches!(phase, Phase::Capstone) {
                    manifest.current.status = CurrentStatus::InProgress;
                }
            }
        }
    }

    halt_if_invalid(&manifest, "submitting this assignment")?;
    store::save(&path, &mut manifest, today, &workspace::backup_stamp())?;
    Ok(manifest)
}

/// Persist a capstone deliverable to `submissions/capstone.md`. The capstone skill
/// detects the file on its next turn and runs the defense + certification. No
/// manifest assignment entry and NO certification write here — capstone stays the
/// single writer of mastery/certification.
pub fn submit_capstone(ws: &Path, slug: &str, content: &str, today: Date) -> AppResult<Manifest> {
    validate_slug(slug)?;
    let path = workspace::manifest_path(ws, slug);
    let mut manifest = store::load(&path)?;

    let file_path = contained_path(ws, slug, "submissions/capstone.md")?;
    if let Some(parent) = file_path.parent() {
        std::fs::create_dir_all(parent)?;
    }
    std::fs::write(&file_path, content)?;

    manifest.history.push(HistoryEntry {
        date: today,
        skill: "app-submit-capstone".into(),
        event: "submitted capstone deliverable".into(),
        result: String::new(),
    });

    halt_if_invalid(&manifest, "submitting the capstone")?;
    store::save(&path, &mut manifest, today, &workspace::backup_stamp())?;
    Ok(manifest)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::service::{ensure_workspace, read_artifact, read_manifest, seed_demo};
    use lyceum_core::validate;
    use time::macros::date;

    const TODAY: Date = date!(2026 - 06 - 19);

    fn seeded() -> (tempfile::TempDir, String) {
        let tmp = tempfile::tempdir().unwrap();
        ensure_workspace(tmp.path()).unwrap();
        // a02 OPEN on m02, current = m02 (taught); m01 mastered.
        let slug = seed_demo(tmp.path(), date!(2026 - 06 - 18)).unwrap();
        (tmp, slug)
    }

    #[test]
    fn submit_writes_file_flips_status_and_keeps_mastery() {
        let (tmp, slug) = seeded();
        let before = read_manifest(tmp.path(), &slug).unwrap();

        let after = submit_assignment(
            tmp.path(),
            &slug,
            "a02",
            "My answer.\n\n- one\n- two\n",
            TODAY,
        )
        .unwrap();

        let a = after.assignments.iter().find(|a| a.id.0 == "a02").unwrap();
        assert_eq!(a.status, AssignmentStatus::Submitted);
        assert_eq!(a.submission_file.as_deref(), Some("submissions/a02.md"));
        assert_eq!(a.submitted_at, Some(TODAY));

        // The hand-in is on disk and reads back through the artifact guard.
        let body = read_artifact(tmp.path(), &slug, "submissions/a02.md").unwrap();
        assert!(body.contains("My answer."));

        // a02 is the only assignment on the current taught module -> route to assess.
        assert_eq!(after.current.phase, Some(Phase::Assess));
        assert_eq!(after.current.status, CurrentStatus::InProgress);

        // Single-writer-for-mastery: modules / objectives / reviews untouched.
        assert_eq!(after.modules, before.modules, "mastery/modules untouched");
        assert_eq!(after.review_queue, before.review_queue, "reviews untouched");
        assert!(after
            .history
            .iter()
            .any(|h| h.skill == "app-submit" && h.event.contains("a02")));
        assert!(validate::validate(&after).is_empty());
    }

    #[test]
    fn submit_persists_across_reload() {
        let (tmp, slug) = seeded();
        submit_assignment(tmp.path(), &slug, "a02", "answer", TODAY).unwrap();
        let reloaded = read_manifest(tmp.path(), &slug).unwrap();
        let a = reloaded
            .assignments
            .iter()
            .find(|a| a.id.0 == "a02")
            .unwrap();
        assert_eq!(a.status, AssignmentStatus::Submitted);
        assert_eq!(a.submission_file.as_deref(), Some("submissions/a02.md"));
    }

    #[test]
    fn submit_rejects_already_graded() {
        let (tmp, slug) = seeded();
        let path = workspace::manifest_path(tmp.path(), &slug);
        let mut m = read_manifest(tmp.path(), &slug).unwrap();
        m.assignments[0].status = AssignmentStatus::Graded;
        store::save(&path, &mut m, TODAY, "graded").unwrap();

        assert!(submit_assignment(tmp.path(), &slug, "a02", "x", TODAY).is_err());
    }

    #[test]
    fn submit_missing_id_errors_without_writing() {
        let (tmp, slug) = seeded();
        let before = read_manifest(tmp.path(), &slug).unwrap();
        assert!(submit_assignment(tmp.path(), &slug, "nope", "x", TODAY).is_err());
        let after = read_manifest(tmp.path(), &slug).unwrap();
        assert_eq!(after.updated, before.updated, "no save on a missing id");
    }

    #[test]
    fn submit_rejects_bad_slug() {
        let (tmp, _slug) = seeded();
        assert!(submit_assignment(tmp.path(), "../escape", "a02", "x", TODAY).is_err());
    }

    #[test]
    fn submit_capstone_writes_deliverable_and_audits() {
        let (tmp, slug) = seeded();
        let after = submit_capstone(tmp.path(), &slug, "# My capstone\n", TODAY).unwrap();
        let body = read_artifact(tmp.path(), &slug, "submissions/capstone.md").unwrap();
        assert!(body.contains("My capstone"));
        assert!(after
            .history
            .iter()
            .any(|h| h.skill == "app-submit-capstone"));
        // No certification fabricated by the app.
        assert!(after.certification.is_none());
        assert!(validate::validate(&after).is_empty());
    }
}
