//! Thin `#[tauri::command]` wrappers over the testable `service` layer.

use tauri::State;

use lyceum_core::model::Manifest;
use lyceum_core::summary::SubjectSummary;

use crate::error::AppResult;
use crate::service::{self, ReviewCandidate, RouteDto, WorkspaceInfo};
use crate::state::AppState;
use crate::workspace;

#[tauri::command]
pub fn workspace_info(state: State<AppState>) -> WorkspaceInfo {
    service::workspace_info(&state.workspace)
}

#[tauri::command]
pub fn list_subjects(state: State<AppState>) -> Vec<SubjectSummary> {
    service::summaries(&state.workspace, workspace::today())
}

#[tauri::command]
pub fn read_manifest(state: State<AppState>, slug: String) -> AppResult<Manifest> {
    service::read_manifest(&state.workspace, &slug)
}

#[tauri::command]
pub fn compute_next_step(state: State<AppState>, slug: String) -> AppResult<RouteDto> {
    service::next_step(&state.workspace, &slug)
}

#[tauri::command]
pub fn regenerate_progress(state: State<AppState>, slug: String) -> AppResult<String> {
    service::regenerate_progress(&state.workspace, &slug, workspace::today())
}

#[tauri::command]
pub fn seed_demo(state: State<AppState>) -> AppResult<String> {
    service::seed_demo(&state.workspace, workspace::today())
}

#[tauri::command]
pub fn review_due(state: State<AppState>, slug: String) -> AppResult<Vec<ReviewCandidate>> {
    service::review_due(&state.workspace, &slug, workspace::today())
}

#[tauri::command]
pub fn review_grade(
    state: State<AppState>,
    slug: String,
    item_id: String,
    grade: String,
) -> AppResult<Manifest> {
    service::grade_review(
        &state.workspace,
        &slug,
        &item_id,
        &grade,
        workspace::today(),
    )
}

#[tauri::command]
pub fn subject_analytics(
    state: State<AppState>,
    slug: String,
) -> AppResult<lyceum_core::analytics::AnalyticsReport> {
    service::subject_analytics(&state.workspace, &slug, workspace::today())
}

#[tauri::command]
pub fn study_streak(state: State<AppState>) -> lyceum_core::streak::StreakInfo {
    service::study_streak(&state.workspace, workspace::today())
}

#[tauri::command]
pub fn read_artifact(state: State<AppState>, slug: String, relpath: String) -> AppResult<String> {
    service::read_artifact(&state.workspace, &slug, &relpath)
}

#[tauri::command]
pub fn placement_pool(
    state: State<AppState>,
    slug: String,
) -> AppResult<lyceum_core::placement::PlacementPool> {
    service::placement_pool(&state.workspace, &slug)
}

#[tauri::command]
pub fn placement_step(answers: Vec<bool>) -> service::PlacementStateDto {
    service::placement_step(&answers)
}

#[tauri::command]
pub fn placement_finalize(
    state: State<AppState>,
    slug: String,
    level: u8,
    evidence: String,
) -> AppResult<Manifest> {
    service::placement_finalize(&state.workspace, &slug, level, evidence, workspace::today())
}

/// The 6-level mastery scale (LEVELS.md), for the onboarding wizard.
#[tauri::command]
pub fn get_levels() -> Vec<(u8, &'static str, &'static str)> {
    vec![
        (1, "Aware", "recall terms, follow guided steps"),
        (2, "Functional", "explain concepts, run routine procedures"),
        (3, "Competent", "work unsupervised on familiar tasks"),
        (4, "Proficient", "handle complex, non-standard problems"),
        (5, "Expert", "produce original, field-quality work"),
        (6, "Master", "extend the practice; teach the field"),
    ]
}
