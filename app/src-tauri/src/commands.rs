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
pub fn list_lessons(
    state: State<AppState>,
    slug: String,
) -> AppResult<Vec<crate::delete::LessonEntry>> {
    crate::delete::list_lessons(&state.workspace, &slug)
}

/// Delete a lesson file and re-open the named module (authoritative id from
/// `list_lessons`) so the next step re-teaches it. Mastery/reviews are kept.
#[tauri::command]
pub fn delete_lesson(
    state: State<AppState>,
    slug: String,
    module_id: String,
    file: String,
) -> AppResult<crate::delete::DeleteLessonResult> {
    crate::delete::delete_lesson(
        &state.workspace,
        &slug,
        &module_id,
        &file,
        workspace::today(),
    )
}

/// Delete an assignment (manifest entry + file) and realign the current phase.
#[tauri::command]
pub fn delete_assignment(
    state: State<AppState>,
    slug: String,
    assignment_id: String,
) -> AppResult<Manifest> {
    crate::delete::delete_assignment(&state.workspace, &slug, &assignment_id, workspace::today())
}

/// Submit a student's hand-in for an assignment: write the answer file, flip the
/// assignment to `submitted`, and realign the phase so the next step assesses it.
#[tauri::command]
pub fn submit_assignment(
    state: State<AppState>,
    slug: String,
    assignment_id: String,
    content: String,
) -> AppResult<Manifest> {
    crate::submit::submit_assignment(
        &state.workspace,
        &slug,
        &assignment_id,
        &content,
        workspace::today(),
    )
}

/// Submit the capstone deliverable; the capstone skill grades + certifies it next.
#[tauri::command]
pub fn submit_capstone(
    state: State<AppState>,
    slug: String,
    content: String,
) -> AppResult<Manifest> {
    crate::submit::submit_capstone(&state.workspace, &slug, &content, workspace::today())
}

/// Hand in the learner's typed answer to the current interactive-placement question.
/// Writes the app-owned `placement-answer.json`; the next placement step grades it.
#[tauri::command]
pub fn submit_placement_answer(
    state: State<AppState>,
    slug: String,
    id: String,
    answer: String,
) -> AppResult<()> {
    crate::submit::submit_placement_answer(&state.workspace, &slug, &id, &answer)
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

// --- Notebook (app-owned Markdown notes; never touches the manifest) ----------

#[tauri::command]
pub fn list_notebooks(
    state: State<AppState>,
    slug: String,
) -> AppResult<Vec<crate::notebook::NotebookEntry>> {
    crate::notebook::list_notebooks(&state.workspace, &slug)
}

#[tauri::command]
pub fn read_notebook(
    state: State<AppState>,
    slug: String,
    id: String,
) -> AppResult<crate::notebook::NotebookEntry> {
    crate::notebook::read_notebook(&state.workspace, &slug, &id)
}

/// Create a note. `moduleId` (optional) anchors it to the current lesson's module.
#[tauri::command]
pub fn create_notebook(
    state: State<AppState>,
    slug: String,
    title: String,
    content: String,
    module_id: Option<String>,
) -> AppResult<crate::notebook::NotebookEntry> {
    crate::notebook::create_notebook(
        &state.workspace,
        &slug,
        &title,
        &content,
        module_id.as_deref(),
        workspace::today(),
    )
}

/// Overwrite a note's title + body (preserves createdAt/moduleId/tags, bumps updatedAt).
#[tauri::command]
pub fn update_notebook(
    state: State<AppState>,
    slug: String,
    id: String,
    title: String,
    content: String,
) -> AppResult<crate::notebook::NotebookEntry> {
    crate::notebook::update_notebook(
        &state.workspace,
        &slug,
        &id,
        &title,
        &content,
        workspace::today(),
    )
}

#[tauri::command]
pub fn delete_notebook(state: State<AppState>, slug: String, id: String) -> AppResult<()> {
    crate::notebook::delete_notebook(&state.workspace, &slug, &id)
}

// --- Notebook flashcards (separate SRS store; manifest.review_queue untouched) --

/// Due flashcards for a subject's notes. `moduleId` scopes to one lesson; omit for all.
#[tauri::command]
pub fn notebook_review_due(
    state: State<AppState>,
    slug: String,
    module_id: Option<String>,
) -> AppResult<Vec<crate::notebook_cards::CardCandidate>> {
    crate::notebook_cards::cards_due(
        &state.workspace,
        &slug,
        module_id.as_deref(),
        workspace::today(),
    )
}

/// Total due-card count for the "N due" badge (whole store, not the capped batch).
#[tauri::command]
pub fn notebook_due_count(state: State<AppState>, slug: String) -> AppResult<usize> {
    crate::notebook_cards::cards_due_count(&state.workspace, &slug, workspace::today())
}

/// Grade a flashcard (schedule-only); returns the remaining due batch.
#[tauri::command]
pub fn notebook_review_grade(
    state: State<AppState>,
    slug: String,
    card_id: String,
    grade: String,
) -> AppResult<Vec<crate::notebook_cards::CardCandidate>> {
    crate::notebook_cards::grade_card(
        &state.workspace,
        &slug,
        &card_id,
        &grade,
        workspace::today(),
    )
}
