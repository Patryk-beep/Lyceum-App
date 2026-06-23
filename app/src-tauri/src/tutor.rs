//! The in-context tutor: a SECOND, read-only `claude` child per subject for free-form Q&A.
//!
//! It never advances curriculum state — `ask_tutor` calls `run_turn` directly (never
//! `run_step`), and the child is spawned `read_only` (allowlist `Read,Grep,Glob`) so it
//! physically cannot write the manifest. The visible Q&A thread + the `--resume` session id
//! are app-owned files (`tutor-thread.json` / `tutor-session.json`), written here — not by
//! the child.

use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

use lyceum_core::model::{AssignmentStatus, Manifest};
use lyceum_engine::{BridgeEvent, ClaudeSession};

use crate::engine_cmds::spawn_config;
use crate::error::{AppError, AppResult};
use crate::state::AppState;
use crate::workspace;

/// Wraps a tutor `BridgeEvent` with its subject slug — same shape/serde as the skill
/// `SessionEnvelope`, but emitted on the dedicated `claude://tutor` channel so tutor streams
/// never land in the skill engine store.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct TutorEnvelope {
    slug: String,
    event: BridgeEvent,
}

#[derive(Debug, Clone, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorMessage {
    /// `"user"` or `"assistant"`.
    pub role: String,
    pub text: String,
}

#[derive(Debug, Clone, Default, PartialEq, serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorThread {
    pub turns: Vec<TutorMessage>,
}

/// What the learner is currently looking at, so the tutor can answer about "the specific
/// thing you're working on". All optional — the tutor always also has the full research.
#[derive(Debug, Clone, Default, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TutorScope {
    /// A subject-relative artifact path, e.g. `lessons/03-...md` or `assignments/02-...md`.
    pub artifact: Option<String>,
    pub module_id: Option<String>,
}

#[derive(serde::Serialize, serde::Deserialize)]
#[serde(rename_all = "camelCase")]
struct SessionFile {
    session_id: String,
}

// --- pure helpers (unit-tested) ------------------------------------------------

/// Ids of assignments still `open` (not yet submitted/graded) — the tutor must not spoil these.
pub fn open_assignment_ids(m: &Manifest) -> Vec<String> {
    m.assignments
        .iter()
        .filter(|a| a.status == AssignmentStatus::Open)
        .map(|a| a.id.0.clone())
        .collect()
}

/// Build the tutor turn prompt: pins the read-only frame, points at the research + the
/// current artifact, and names the OPEN assignments as off-limits (best-effort no-spoiler).
pub fn tutor_prompt(slug: &str, manifest: &Manifest, scope: &TutorScope, question: &str) -> String {
    let open = open_assignment_ids(manifest);
    let open_clause = if open.is_empty() {
        "There are no open assignments right now.".to_string()
    } else {
        format!(
            "These assignments are still OPEN (not yet handed in): {}. Do NOT open their brief \
             files and do NOT reveal their solutions, answer keys, or rubrics — coach with \
             questions and hints only (retrieval before reveal).",
            open.join(", ")
        )
    };
    let artifact_clause = match &scope.artifact {
        Some(a) => format!(
            " The learner is currently looking at `{a}` — read it for the specific context of \
             their question."
        ),
        None => String::new(),
    };
    let module_clause = scope
        .module_id
        .as_deref()
        .map(|m| format!(" They are working in module {m}."))
        .unwrap_or_default();
    format!(
        "You are the Lyceum TUTOR for the subject in the workspace folder `learning/{slug}/`. \
         Run the `lyceum:tutor` skill. You are STRICTLY READ-ONLY — you have no write tools and \
         must never modify the manifest, mastery, progress, or any file. FIRST read \
         `learning/{slug}/manifest.json` to see where the learner is, then read the course \
         materials you need to answer in context: `research.md` and `knowledge-map.json` (the \
         full research), `curriculum.json`, the relevant `lessons/` file, and `progress.md`.\
         {artifact_clause}{module_clause} The manifest/progress may be momentarily mid-update if \
         a lesson or grading is running — just read the latest on disk. {open_clause} Answer the \
         learner at their level, leading them to understanding with worked examples and a hint \
         ladder rather than handing over answers; use growth framing. Stay within THIS subject's \
         folder.\n\nThe learner asks:\n{question}"
    )
}

fn subject_dir(ws: &Path, slug: &str) -> PathBuf {
    ws.join("learning").join(slug)
}
fn thread_path(ws: &Path, slug: &str) -> PathBuf {
    subject_dir(ws, slug).join("tutor-thread.json")
}
fn session_path(ws: &Path, slug: &str) -> PathBuf {
    subject_dir(ws, slug).join("tutor-session.json")
}

/// Load the visible Q&A thread; empty when absent/corrupt (never errors).
pub fn load_thread(ws: &Path, slug: &str) -> TutorThread {
    std::fs::read_to_string(thread_path(ws, slug))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

/// Append one Q&A pair to the visible thread. No-op if the subject dir is gone (NEVER
/// recreates a deleted subject's directory — the delete-resurrection guard).
pub fn append_turn(ws: &Path, slug: &str, question: &str, answer: &str) {
    if !subject_dir(ws, slug).is_dir() {
        return;
    }
    let mut thread = load_thread(ws, slug);
    thread.turns.push(TutorMessage {
        role: "user".into(),
        text: question.to_string(),
    });
    thread.turns.push(TutorMessage {
        role: "assistant".into(),
        text: answer.to_string(),
    });
    if let Ok(json) = serde_json::to_string_pretty(&thread) {
        let _ = std::fs::write(thread_path(ws, slug), json);
    }
}

/// The persisted `--resume` session id, if any (and non-empty).
pub fn read_session_id(ws: &Path, slug: &str) -> Option<String> {
    std::fs::read_to_string(session_path(ws, slug))
        .ok()
        .and_then(|s| serde_json::from_str::<SessionFile>(&s).ok())
        .map(|f| f.session_id)
        .filter(|s| !s.is_empty())
}

/// Persist the session id for `--resume`. No-op if the dir is gone or the id is empty (so a
/// failed/empty turn never clobbers a good prior id).
pub fn write_session_id(ws: &Path, slug: &str, id: &str) {
    if id.is_empty() || !subject_dir(ws, slug).is_dir() {
        return;
    }
    if let Ok(json) = serde_json::to_string(&SessionFile {
        session_id: id.to_string(),
    }) {
        let _ = std::fs::write(session_path(ws, slug), json);
    }
}

/// Wipe both tutor files (a full reset → next turn starts a fresh thread).
pub fn clear_files(ws: &Path, slug: &str) {
    let _ = std::fs::remove_file(thread_path(ws, slug));
    let _ = std::fs::remove_file(session_path(ws, slug));
}

// --- commands ------------------------------------------------------------------

/// Ask the tutor a free-form question. Streams `BridgeEvent`s on `claude://tutor`; returns the
/// final answer text. NEVER advances curriculum state (no `run_step`, no manifest write).
#[tauri::command]
pub async fn ask_tutor(
    app: AppHandle,
    state: State<'_, AppState>,
    slug: String,
    question: String,
    scope: TutorScope,
) -> AppResult<String> {
    if slug.trim().is_empty() {
        return Err(AppError::msg("no subject in context"));
    }
    crate::delete::validate_slug(&slug)?;
    if question.trim().is_empty() {
        return Err(AppError::msg("empty question"));
    }
    let manifest = crate::service::read_manifest(&state.workspace, &slug)?;
    let prompt = tutor_prompt(&slug, &manifest, &scope, &question);
    let resume = read_session_id(&state.workspace, &slug);

    let app2 = app.clone();
    let ev_slug = slug.clone();
    let on_event = move |ev: BridgeEvent| {
        let _ = app2.emit(
            "claude://tutor",
            TutorEnvelope {
                slug: ev_slug.clone(),
                event: ev,
            },
        );
    };

    // Tutor cell lock FIRST, then a tutor permit (cell-before-permit, like the skill path, so
    // a queued same-slug tutor turn never sits on a permit). Distinct cell + distinct semaphore
    // from skill turns ⇒ a tutor turn and a skill turn for one subject run concurrently.
    let cell = state.tutor_session_cell(&slug).await;
    let mut guard = cell.lock().await;
    let _permit = state
        .tutor_slots
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    // The subject may have been deleted while this turn waited on the cell lock — don't spawn a
    // tutor child (and later recreate files) for a removed subject.
    if !workspace::manifest_path(&state.workspace, &slug).is_file() {
        return Err(AppError::msg("subject was deleted"));
    }
    if guard.is_none() {
        let session =
            match ClaudeSession::spawn(&spawn_config(state.inner(), resume.clone(), true)?).await {
                Ok(s) => s,
                // A stale/garbage-collected `--resume` id fails the spawn; retry ONCE with a fresh
                // thread (the new id is persisted after the turn). Lost prior context is accepted.
                Err(e) => {
                    if resume.is_some() {
                        ClaudeSession::spawn(&spawn_config(state.inner(), None, true)?)
                            .await
                            .map_err(|e2| AppError::msg(e2.to_string()))?
                    } else {
                        return Err(AppError::msg(e.to_string()));
                    }
                }
            };
        *guard = Some(session);
    }
    let session = guard.as_mut().expect("tutor session present");
    let outcome = session
        .run_turn(&prompt, on_event)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;

    // Persist the (possibly rotated) session id for cross-restart `--resume`; skip empties.
    if let Some(id) = &outcome.session_id {
        write_session_id(&state.workspace, &slug, id);
    }
    // Record the visible Q&A (app-owned; the child wrote nothing).
    append_turn(&state.workspace, &slug, &question, &outcome.text);
    Ok(outcome.text)
}

/// Load a subject's saved tutor thread (for the panel scrollback on open).
#[tauri::command]
pub fn read_tutor_thread(state: State<AppState>, slug: String) -> AppResult<TutorThread> {
    crate::delete::validate_slug(&slug)?;
    Ok(load_thread(&state.workspace, &slug))
}

/// Reset a subject's tutor: shut down the warm tutor child and delete both tutor files, so the
/// next question starts a genuinely fresh conversation.
#[tauri::command]
pub async fn clear_tutor_thread(state: State<'_, AppState>, slug: String) -> AppResult<()> {
    crate::delete::validate_slug(&slug)?;
    let cell = {
        let mut map = state.tutor_sessions.lock().await;
        map.remove(&slug)
    };
    if let Some(cell) = cell {
        let mut guard = cell.lock().await;
        if let Some(session) = guard.take() {
            let _ = tokio::time::timeout(Duration::from_secs(5), session.shutdown()).await;
        }
    }
    clear_files(&state.workspace, &slug);
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use lyceum_core::model::Manifest;

    fn manifest_with_assignments(assignments: &str) -> Manifest {
        let s = format!(
            r#"{{"subject":"S","slug":"s","created":"2026-06-01","updated":"2026-06-01",
                "scale":{{"start":1,"target":2}},"current":{{"status":"in-progress"}},
                "modules":[],"assignments":{assignments},"settings":{{}}}}"#
        );
        serde_json::from_str(&s).expect("valid manifest")
    }

    #[test]
    fn open_assignment_ids_lists_only_open() {
        let m = manifest_with_assignments(
            r#"[{"id":"a01","moduleId":"m01","type":"x","file":"f","status":"graded"},
                {"id":"a02","moduleId":"m01","type":"x","file":"f","status":"open"},
                {"id":"a03","moduleId":"m01","type":"x","file":"f","status":"submitted"}]"#,
        );
        assert_eq!(open_assignment_ids(&m), vec!["a02".to_string()]);
    }

    #[test]
    fn prompt_names_skill_research_and_open_assignments() {
        let m = manifest_with_assignments(
            r#"[{"id":"a02","moduleId":"m01","type":"x","file":"f","status":"open"}]"#,
        );
        let scope = TutorScope {
            artifact: Some("lessons/03-x.md".into()),
            module_id: Some("m03".into()),
        };
        let p = tutor_prompt("spanish", &m, &scope, "why is ser vs estar hard?");
        assert!(p.contains("lyceum:tutor"));
        assert!(p.contains("READ-ONLY"));
        assert!(p.contains("research.md") && p.contains("knowledge-map.json"));
        assert!(p.contains("lessons/03-x.md")); // current artifact threaded in
        assert!(p.contains("module m03"));
        assert!(p.contains("a02")); // open assignment named as off-limits
        assert!(p.contains("why is ser vs estar hard?"));
    }

    #[test]
    fn prompt_handles_no_open_assignments_and_no_scope() {
        let m = manifest_with_assignments("[]");
        let p = tutor_prompt("s", &m, &TutorScope::default(), "q?");
        assert!(p.contains("no open assignments"));
        assert!(p.contains("lyceum:tutor"));
    }

    #[test]
    fn thread_roundtrips_and_never_recreates_a_deleted_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();
        let dir = subject_dir(ws, "spanish");
        std::fs::create_dir_all(&dir).unwrap();

        assert_eq!(load_thread(ws, "spanish"), TutorThread::default());
        append_turn(ws, "spanish", "q1", "a1");
        append_turn(ws, "spanish", "q2", "a2");
        let t = load_thread(ws, "spanish");
        assert_eq!(t.turns.len(), 4);
        assert_eq!(t.turns[0].role, "user");
        assert_eq!(t.turns[1].text, "a1");

        // Delete the subject dir → append must NO-OP (no resurrection).
        std::fs::remove_dir_all(&dir).unwrap();
        append_turn(ws, "spanish", "q3", "a3");
        assert!(
            !dir.exists(),
            "append_turn must not recreate a deleted subject dir"
        );
    }

    #[test]
    fn session_id_persists_but_skips_empty_and_missing_dir() {
        let tmp = tempfile::tempdir().unwrap();
        let ws = tmp.path();
        std::fs::create_dir_all(subject_dir(ws, "s")).unwrap();

        assert_eq!(read_session_id(ws, "s"), None);
        write_session_id(ws, "s", "sess-123");
        assert_eq!(read_session_id(ws, "s"), Some("sess-123".to_string()));
        // An empty id must NOT clobber the good one.
        write_session_id(ws, "s", "");
        assert_eq!(read_session_id(ws, "s"), Some("sess-123".to_string()));
        // Clearing removes it.
        clear_files(ws, "s");
        assert_eq!(read_session_id(ws, "s"), None);
    }
}
