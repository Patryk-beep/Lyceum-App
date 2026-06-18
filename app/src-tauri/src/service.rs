//! Business logic for the engine-only (M0) command surface. Deliberately free of
//! Tauri types so it can be unit-tested headlessly against a temp workspace.

use std::path::Path;

use serde::Serialize;
use time::Date;

use lyceum_core::model::Manifest;
use lyceum_core::routing::{derive_route, Route};
use lyceum_core::summary::{subject_summary, SubjectSummary};
use lyceum_core::{progress, srs, store};

use crate::error::{AppError, AppResult};
use crate::workspace;

/// The golden demo subject, embedded so `seed_demo` works in a fresh install.
const GOLDEN_JSON: &str = include_str!("../../tests/fixtures/manifests/golden.json");

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceInfo {
    pub root: String,
    pub subject_count: usize,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RouteDto {
    pub kind: String,
    pub why: String,
    pub target: Option<String>,
}

fn route_dto(route: Route, why: String) -> RouteDto {
    let (kind, target) = match route {
        Route::Research => ("research", None),
        Route::Placement => ("placement", None),
        Route::BuildCurriculum => ("buildCurriculum", None),
        Route::Teach { module_id } => ("teach", Some(module_id.0)),
        Route::CreateAssignment { module_id } => ("createAssignment", Some(module_id.0)),
        Route::CompleteOpenAssignment { assignment_id } => {
            ("completeAssignment", Some(assignment_id.0))
        }
        Route::Assess { assignment_id } => ("assess", Some(assignment_id.0)),
        Route::Capstone => ("capstone", None),
        Route::CourseComplete => ("courseComplete", None),
    };
    RouteDto {
        kind: kind.to_string(),
        why,
        target,
    }
}

pub fn workspace_info(ws: &Path) -> WorkspaceInfo {
    let slugs = workspace::list_slugs(ws);
    WorkspaceInfo {
        root: ws.display().to_string(),
        subject_count: slugs.len(),
    }
}

pub fn read_manifest(ws: &Path, slug: &str) -> AppResult<Manifest> {
    let path = workspace::manifest_path(ws, slug);
    Ok(store::load(&path)?)
}

/// Summaries for every subject. A subject whose manifest fails to parse is skipped
/// (one bad file must not blank the whole dashboard).
pub fn summaries(ws: &Path, today: Date) -> Vec<SubjectSummary> {
    let mut out = Vec::new();
    for slug in workspace::list_slugs(ws) {
        let path = workspace::manifest_path(ws, &slug);
        match store::load(&path) {
            Ok(manifest) => {
                let disk = workspace::disk_state(ws, &slug);
                out.push(subject_summary(&manifest, &disk, today));
            }
            Err(_) => continue,
        }
    }
    out
}

pub fn next_step(ws: &Path, slug: &str) -> AppResult<RouteDto> {
    let manifest = read_manifest(ws, slug)?;
    let disk = workspace::disk_state(ws, slug);
    let decision = derive_route(&manifest, &disk);
    Ok(route_dto(decision.route, decision.why))
}

/// Re-render `progress.md` from disk truth and persist it. Returns the markdown.
pub fn regenerate_progress(ws: &Path, slug: &str, today: Date) -> AppResult<String> {
    let manifest = read_manifest(ws, slug)?;
    let disk = workspace::disk_state(ws, slug);
    let decision = derive_route(&manifest, &disk);
    let reviews_due = srs::due_count(&manifest.review_queue, today);
    let rendered = progress::render_progress(&manifest, &decision.why, reviews_due);
    let path = workspace::subject_dir(ws, slug).join("progress.md");
    std::fs::write(&path, &rendered)?;
    Ok(rendered)
}

/// Seed the bundled demo subject if it isn't already present. Returns its slug.
pub fn seed_demo(ws: &Path, today: Date) -> AppResult<String> {
    let mut manifest: Manifest = serde_json::from_str(GOLDEN_JSON)?;
    let slug = manifest.slug.clone();
    let dir = workspace::subject_dir(ws, &slug);

    if workspace::manifest_path(ws, &slug).is_file() {
        return Ok(slug); // idempotent
    }

    std::fs::create_dir_all(dir.join("lessons"))?;
    std::fs::create_dir_all(dir.join("assignments"))?;

    // Side artifacts so DiskState is complete and routing behaves like a real course.
    std::fs::write(
        dir.join("research.md"),
        "# Research — Conversational Spanish\n\n(Sample research output.)\n",
    )?;
    std::fs::write(
        dir.join("knowledge-map.json"),
        "{\n  \"tiers\": [],\n  \"concepts\": [],\n  \"prerequisites\": [],\n  \"misconceptions\": [],\n  \"vocabulary\": []\n}\n",
    )?;
    std::fs::write(dir.join("curriculum.json"), "{\n  \"modules\": []\n}\n")?;
    std::fs::write(
        dir.join("assignments").join("02-m02-guided-practice.md"),
        "# Guided practice — Present tense\n\n(Sample assignment brief.)\n",
    )?;

    let path = workspace::manifest_path(ws, &slug);
    let stamp = lyceum_core::date::format_iso(today);
    store::save(&path, &mut manifest, today, &format!("{stamp}-seed"))?;

    // Generate the initial progress.md too.
    regenerate_progress(ws, &slug, today)?;

    Ok(slug)
}

/// Ensure the workspace skeleton (`learning/`) exists.
pub fn ensure_workspace(ws: &Path) -> AppResult<()> {
    std::fs::create_dir_all(workspace::learning_dir(ws))
        .map_err(|e| AppError::msg(format!("cannot create workspace: {e}")))
}

#[cfg(test)]
mod tests {
    use super::*;
    use time::macros::date;

    fn temp_ws() -> tempfile::TempDir {
        tempfile::tempdir().unwrap()
    }

    #[test]
    fn seed_demo_then_summaries_match_hand_values() {
        let tmp = temp_ws();
        let ws = tmp.path();
        ensure_workspace(ws).unwrap();
        let today = date!(2026 - 06 - 18);

        let slug = seed_demo(ws, today).unwrap();
        assert_eq!(slug, "conversational-spanish");

        let s = summaries(ws, today);
        assert_eq!(s.len(), 1);
        let cs = &s[0];
        assert_eq!(cs.subject, "Conversational Spanish");
        assert_eq!(cs.modules_total, 3);
        assert_eq!(cs.modules_mastered, 1);
        assert_eq!(cs.reviews_due, 3);
        // m02 has an open assignment -> next action mentions completing it.
        assert!(
            cs.next_action.contains("open assignment"),
            "{}",
            cs.next_action
        );
    }

    #[test]
    fn seed_demo_is_idempotent() {
        let tmp = temp_ws();
        let ws = tmp.path();
        ensure_workspace(ws).unwrap();
        let today = date!(2026 - 06 - 18);
        seed_demo(ws, today).unwrap();
        seed_demo(ws, today).unwrap(); // must not error or duplicate
        assert_eq!(summaries(ws, today).len(), 1);
    }

    #[test]
    fn next_step_routes_demo_to_complete_assignment() {
        let tmp = temp_ws();
        let ws = tmp.path();
        ensure_workspace(ws).unwrap();
        let today = date!(2026 - 06 - 18);
        let slug = seed_demo(ws, today).unwrap();
        let step = next_step(ws, &slug).unwrap();
        assert_eq!(step.kind, "completeAssignment");
        assert_eq!(step.target.as_deref(), Some("a02"));
    }

    #[test]
    fn regenerate_progress_writes_file() {
        let tmp = temp_ws();
        let ws = tmp.path();
        ensure_workspace(ws).unwrap();
        let today = date!(2026 - 06 - 18);
        let slug = seed_demo(ws, today).unwrap();
        let md = regenerate_progress(ws, &slug, today).unwrap();
        assert!(md.contains("# Progress — Conversational Spanish"));
        assert!(workspace::subject_dir(ws, &slug)
            .join("progress.md")
            .is_file());
    }

    #[test]
    fn empty_workspace_has_no_subjects() {
        let tmp = temp_ws();
        let ws = tmp.path();
        ensure_workspace(ws).unwrap();
        assert_eq!(summaries(ws, date!(2026 - 06 - 18)).len(), 0);
        assert_eq!(workspace_info(ws).subject_count, 0);
    }
}
