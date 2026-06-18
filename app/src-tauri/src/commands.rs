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
