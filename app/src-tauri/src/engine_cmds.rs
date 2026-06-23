//! Tauri commands for the Claude bridge. Events stream on `claude://session`.

use std::path::{Path, PathBuf};
use std::time::Duration;

use tauri::{AppHandle, Emitter, State};

use lyceum_core::model::{AssignmentStatus, Manifest, ModuleId, ModuleStatus};
use lyceum_core::routing::{derive_route, Route};
use lyceum_engine::{
    canonical, doctor, run_step, BridgeEvent, ClaudeSession, DoctorReport, SpawnConfig,
};

use crate::error::{AppError, AppResult};
use crate::prompts::prompt_for;
use crate::state::AppState;
use crate::workspace;

/// Wraps each `BridgeEvent` with the subject slug it belongs to, so the webview can
/// key live run-state per subject. `BridgeEvent` itself stays slug-agnostic.
#[derive(Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
struct SessionEnvelope {
    slug: String,
    event: lyceum_engine::BridgeEvent,
}

/// Reserved slug for the Diagnostics smoke turn (no real subject).
const DIAGNOSTICS_SLUG: &str = "__diagnostics__";

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PreflightReport {
    pub claude_found: bool,
    pub plugin_staged: bool,
    pub ready: bool,
    pub error: Option<String>,
    pub claude_path: Option<String>,
}

#[tauri::command]
pub fn preflight(state: State<AppState>) -> PreflightReport {
    PreflightReport {
        claude_found: state.claude_bin.is_some(),
        plugin_staged: state.staged_plugin.is_some(),
        ready: state.engine_ready(),
        error: state.preflight_error.clone(),
        claude_path: state.claude_bin.as_ref().map(|p| p.display().to_string()),
    }
}

pub(crate) fn spawn_config(
    state: &AppState,
    resume: Option<String>,
    read_only: bool,
) -> AppResult<SpawnConfig> {
    let claude_bin = state
        .claude_bin
        .clone()
        .ok_or_else(|| AppError::msg("claude not found (preflight failed)"))?;
    let plugin_dir = state
        .staged_plugin
        .clone()
        .ok_or_else(|| AppError::msg("lyceum plugin not staged"))?;
    let workspace = canonical(&state.workspace).map_err(|e| AppError::msg(e.to_string()))?;
    Ok(SpawnConfig {
        claude_bin,
        workspace,
        plugin_dir,
        model: state.model.clone(),
        resume,
        read_only,
    })
}

#[tauri::command]
pub async fn claude_doctor(state: State<'_, AppState>) -> AppResult<DoctorReport> {
    let cfg = spawn_config(state.inner(), None, false)?;
    doctor(&cfg).await.map_err(|e| AppError::msg(e.to_string()))
}

/// Run one turn against a fresh session, streaming each `BridgeEvent` to the
/// webview on `claude://session`. Returns the final assistant text. (The full
/// per-subject `SessionManager` + `claude://<slug>` namespacing lands in M2.)
#[tauri::command]
pub async fn claude_smoke(
    app: AppHandle,
    state: State<'_, AppState>,
    prompt: String,
) -> AppResult<String> {
    let cfg = spawn_config(state.inner(), None, false)?;
    let mut session = ClaudeSession::spawn(&cfg)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    let app2 = app.clone();
    let outcome = session
        .run_turn(&prompt, move |ev| {
            let _ = app2.emit(
                "claude://session",
                SessionEnvelope {
                    slug: DIAGNOSTICS_SLUG.to_string(),
                    event: ev,
                },
            );
        })
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    session.shutdown().await;
    Ok(outcome.text)
}

/// Ordered creation milestones: (artifact filename, phase id emitted to the UI).
/// `placement-state.json` (the interactive placement's first question) only appears
/// for a `"test"` start — otherwise the watcher simply never fires it and the wizard
/// omits the step. (A `"test"` start stops here to await the learner; curriculum is
/// built later, after placement finalizes.)
const CREATION_PROBES: [(&str, &str); 3] = [
    ("knowledge-map.json", "research"),
    ("placement-state.json", "placement"),
    ("curriculum.json", "curriculum"),
];

/// True only when the file exists AND parses as JSON — guards the half-written
/// race (an artifact mid-write is on disk but not yet a valid milestone).
fn file_is_valid_json(path: &Path) -> bool {
    std::fs::read_to_string(path)
        .ok()
        .and_then(|s| serde_json::from_str::<serde_json::Value>(&s).ok())
        .is_some()
}

/// Scan the probe files; flip newly-valid ones in `fired` and return their phase
/// ids in probe order. Pure over the filesystem, so it's unit-testable.
fn newly_fired_milestones(dir: &Path, fired: &mut [bool; 3]) -> Vec<String> {
    let mut out = Vec::new();
    for (i, (file, phase)) in CREATION_PROBES.iter().enumerate() {
        if !fired[i] && file_is_valid_json(&dir.join(file)) {
            fired[i] = true;
            out.push((*phase).to_string());
        }
    }
    out
}

/// Poll `<subject_dir>/` during a creation turn and emit a `Milestone` event the
/// instant each phase's artifact lands. Aborted once the turn returns.
/// ponytail: poll, not the `notify` crate — 3 files over a ~60s turn.
async fn watch_creation_milestones(app: AppHandle, dir: PathBuf, slug: String) {
    let mut fired = [false; 3];
    loop {
        for phase in newly_fired_milestones(&dir, &mut fired) {
            let _ = app.emit(
                "claude://session",
                SessionEnvelope {
                    slug: slug.clone(),
                    event: BridgeEvent::Milestone { phase },
                },
            );
        }
        if fired.iter().all(|&f| f) {
            return;
        }
        tokio::time::sleep(Duration::from_millis(400)).await;
    }
}

/// Create a new subject by running the `learn` setup turn (answers fed as the first
/// message so `learn` never needs AskUserQuestion). Returns the new slug.
#[tauri::command]
pub async fn create_subject(
    app: AppHandle,
    state: State<'_, AppState>,
    subject: String,
    target: u8,
    start: String,
) -> AppResult<String> {
    let slug = crate::service::slugify(&subject);
    if slug.is_empty() {
        return Err(AppError::msg("subject title produced an empty slug"));
    }
    let today = workspace::today();
    // Scaffold the full per-subject skeleton (subject dir + lessons/assignments/
    // quizzes) deterministically, so later skills find their folders regardless of
    // what the headless `learn` turn writes.
    let subject_dir = workspace::subject_dir(&state.workspace, &slug);
    crate::service::scaffold_subject_dirs(&subject_dir)
        .map_err(|e| AppError::msg(e.to_string()))?;

    let start_clause = if start.eq_ignore_ascii_case("test") {
        "run a placement test to decide the starting level (scale.start = \"test\")".to_string()
    } else {
        format!("start at level {start}")
    };
    let prompt = format!(
        "Run the `lyceum:learn` skill to set up a NEW subject in this workspace. The \
         learner's setup answers are: subject = \"{subject}\"; target level = {target}; \
         {start_clause}. Use the slug \"{slug}\" and create `learning/{slug}/manifest.json` \
         per references/MANIFEST.md (set created/updated, scale, current, settings). Do not \
         ask the user any questions. When done, output the line <<LYCEUM_DONE>>."
    );

    let cfg = spawn_config(state.inner(), None, false)?;
    let app2 = app.clone();
    let ev_slug = slug.clone();
    let mut on_event = move |ev: lyceum_engine::BridgeEvent| {
        let _ = app2.emit(
            "claude://session",
            SessionEnvelope {
                slug: ev_slug.clone(),
                event: ev,
            },
        );
    };

    // Per-slug cell lock (fresh subject → uncontended) then a global turn permit, so
    // creating a subject runs concurrently with steps in OTHER subjects but is still
    // bounded. Acquire the cell first so a queued same-slug turn never holds a permit.
    let cell = state.session_cell(&slug).await;
    let mut guard = cell.lock().await;
    let _permit = state
        .turn_slots
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    if guard.is_none() {
        *guard = Some(
            ClaudeSession::spawn(&cfg)
                .await
                .map_err(|e| AppError::msg(e.to_string()))?,
        );
    }
    let session = guard.as_mut().expect("session present");

    // Stream creation progress: poll for each phase's artifact and emit a
    // Milestone the instant it lands, so the wizard shows research → [placement]
    // → curriculum instead of an opaque "Setting up…". Aborted (always, incl. the
    // error path) once the turn returns, so the poll task never leaks.
    let watcher = tokio::spawn(watch_creation_milestones(
        app.clone(),
        subject_dir.clone(),
        slug.clone(),
    ));
    let result = run_step(
        session,
        &state.workspace,
        &slug,
        &prompt,
        today,
        &mut on_event,
    )
    .await;
    watcher.abort();
    let report = result.map_err(|e| AppError::msg(e.to_string()))?;
    if report.manifest.is_none() {
        return Err(AppError::msg(
            "learn did not produce a manifest; check the live session log",
        ));
    }
    if !report.is_valid() {
        return Err(AppError::msg(format!(
            "new manifest failed validation: {}",
            report.validation_errors.join("; ")
        )));
    }
    Ok(slug)
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct StepDto {
    /// `true` when a generative turn ran; `false` for learner-driven routes.
    pub ran_turn: bool,
    pub ok: bool,
    pub validation_errors: Vec<String>,
    pub manifest: Option<Manifest>,
    pub next_action: String,
}

/// Loop-safety post-condition for a remediation turn: the module must now have a pending
/// (open/submitted) drill to work, OR have been mastered. A drifting `remediate` turn that
/// wrote neither would make the router re-route to Remediate indefinitely. Pure over the
/// manifest so it is unit-testable without a live session.
fn remediation_progressed(manifest: &Manifest, module_id: &ModuleId) -> bool {
    let mastered = manifest
        .modules
        .iter()
        .find(|m| &m.id == module_id)
        .map(|m| m.status == ModuleStatus::Mastered)
        .unwrap_or(false);
    let has_pending = manifest.assignments.iter().any(|a| {
        &a.module_id == module_id
            && matches!(
                a.status,
                AssignmentStatus::Open | AssignmentStatus::Submitted
            )
    });
    mastered || has_pending
}

/// Run the next routed generative step for a subject through its warm session.
/// Streams `BridgeEvent`s on `claude://session`; HALTs (returns `validationErrors`)
/// if the reloaded manifest is impossible.
#[tauri::command]
pub async fn run_subject_step(
    app: AppHandle,
    state: State<'_, AppState>,
    slug: String,
) -> AppResult<StepDto> {
    let today = workspace::today();
    let manifest = crate::service::read_manifest(&state.workspace, &slug)?;
    let disk = workspace::disk_state(&state.workspace, &slug);
    let decision = derive_route(&manifest, &disk);

    let prompt = match prompt_for(&decision.route, &slug) {
        Some(p) => p,
        None => {
            // Learner-driven route (complete assignment / course done) — no turn.
            return Ok(StepDto {
                ran_turn: false,
                ok: true,
                validation_errors: vec![],
                manifest: Some(manifest),
                next_action: decision.why,
            });
        }
    };

    let cfg = spawn_config(state.inner(), None, false)?;
    let app2 = app.clone();
    let ev_slug = slug.clone();
    let mut on_event = move |ev: lyceum_engine::BridgeEvent| {
        let _ = app2.emit(
            "claude://session",
            SessionEnvelope {
                slug: ev_slug.clone(),
                event: ev,
            },
        );
    };

    // Lock this subject's cell (serializes same-subject turns; different subjects
    // have different cells and run concurrently), then take a global turn permit to
    // bound live children. Cell-before-permit so a queued same-slug turn doesn't sit
    // on a permit while it waits.
    let cell = state.session_cell(&slug).await;
    let mut guard = cell.lock().await;
    let _permit = state
        .turn_slots
        .clone()
        .acquire_owned()
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    // The subject may have been deleted while this step waited on the cell lock —
    // don't spawn a zombie session pointing at a removed workspace.
    if !workspace::manifest_path(&state.workspace, &slug).is_file() {
        return Err(AppError::msg("subject was deleted"));
    }
    if guard.is_none() {
        *guard = Some(
            ClaudeSession::spawn(&cfg)
                .await
                .map_err(|e| AppError::msg(e.to_string()))?,
        );
    }
    let session = guard.as_mut().expect("session present");

    let mut report = run_step(
        session,
        &state.workspace,
        &slug,
        &prompt,
        today,
        &mut on_event,
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;

    // Loop-safety post-condition: a remediation turn MUST leave the module with a drill to
    // work (or mastered). If a drifting `remediate` turn wrote neither, the router would
    // route straight back to Remediate forever — surface it as a validation error (halts the
    // step, prompts a re-run) instead of silently looping.
    if let Route::Remediate { module_id, .. } = &decision.route {
        if let Some(m) = &report.manifest {
            if report.validation_errors.is_empty() && !remediation_progressed(m, module_id) {
                report.validation_errors.push(
                    "remediation produced no new practice assignment — re-run this step"
                        .to_string(),
                );
            }
        }
    }

    let next_action = report
        .manifest
        .as_ref()
        .map(|m| derive_route(m, &disk).why)
        .unwrap_or_default();

    Ok(StepDto {
        ran_turn: true,
        ok: report.is_valid() && report.outcome.ok,
        validation_errors: report.validation_errors,
        manifest: report.manifest,
        next_action,
    })
}

/// Delete an entire subject: shut down its warm `claude` child (if any), then
/// remove `learning/<slug>/`. Lives here (not in `commands`) because it touches
/// the tokio session map. The lock is acquired FIRST and held across the whole
/// op so an in-flight step for this slug finishes and no step can re-insert a
/// zombie session pointing at the deleted dir.
#[tauri::command]
pub async fn delete_subject(state: State<'_, AppState>, slug: String) -> AppResult<()> {
    crate::delete::validate_slug(&slug)?;
    // Detach this subject's cell from the map FIRST: a same-slug run racing in now
    // creates a fresh (empty) cell and then trips the deleted recheck in
    // run_subject_step, so it can't resurrect the dir we're about to remove.
    let cell = {
        let mut map = state.sessions.lock().await;
        map.remove(&slug)
    };
    if let Some(cell) = cell {
        // Wait out any in-flight turn on the old cell, then shut its child down.
        let mut guard = cell.lock().await;
        if let Some(session) = guard.take() {
            // Bound the shutdown so a wedged child can't hang the lock; the OS reaps
            // the orphan on app exit. ponytail: 5s timeout, forceful-kill later.
            let _ = tokio::time::timeout(Duration::from_secs(5), session.shutdown()).await;
        }
    }
    // Same detach-first teardown for the subject's TUTOR cell, or its warm child leaks and a
    // racing ask_tutor (which rechecks manifest existence after locking) can't resurrect the dir.
    let tutor_cell = {
        let mut map = state.tutor_sessions.lock().await;
        map.remove(&slug)
    };
    if let Some(cell) = tutor_cell {
        let mut guard = cell.lock().await;
        if let Some(session) = guard.take() {
            let _ = tokio::time::timeout(Duration::from_secs(5), session.shutdown()).await;
        }
    }
    crate::delete::delete_subject_dir(&state.workspace, &slug)
}

/// Reset a subject's curriculum: wipe modules/assignments, rewind `current.*`,
/// keep the (unlinked) review schedule, and delete `curriculum.json` so the next
/// step re-routes to build-curriculum. Async + session-locked because it deletes
/// a routing sentinel a same-slug build-curriculum turn writes.
#[tauri::command]
pub async fn reset_curriculum(state: State<'_, AppState>, slug: String) -> AppResult<Manifest> {
    crate::delete::validate_slug(&slug)?;
    // Serialize only vs a SAME-slug build-curriculum turn (its own cell), not all
    // subjects, so resetting one subject doesn't block runs in others.
    let cell = state.session_cell(&slug).await;
    let _guard = cell.lock().await;
    crate::delete::reset_curriculum(&state.workspace, &slug, workspace::today())
}

#[cfg(test)]
mod tests {
    use super::{file_is_valid_json, newly_fired_milestones, remediation_progressed};
    use crate::state::{AppState, MAX_CONCURRENT_TURNS, MAX_CONCURRENT_TUTOR};
    use lyceum_core::model::{Manifest, ModuleId};
    use std::fs;
    use std::sync::Arc;
    use tokio::sync::Semaphore;

    fn test_state() -> AppState {
        AppState {
            workspace: std::env::temp_dir(),
            claude_bin: None,
            staged_plugin: None,
            preflight_error: None,
            model: "test".to_string(),
            sessions: Default::default(),
            turn_slots: Arc::new(Semaphore::new(MAX_CONCURRENT_TURNS)),
            tutor_sessions: Default::default(),
            tutor_slots: Arc::new(Semaphore::new(MAX_CONCURRENT_TUTOR)),
        }
    }

    #[tokio::test]
    async fn tutor_cell_is_per_slug_and_distinct_from_skill_cell() {
        let st = test_state();
        let t1 = st.tutor_session_cell("spanish").await;
        let t2 = st.tutor_session_cell("spanish").await;
        let skill = st.session_cell("spanish").await;
        assert!(
            Arc::ptr_eq(&t1, &t2),
            "same slug returns the same tutor cell"
        );
        assert!(
            !Arc::ptr_eq(&t1, &skill),
            "the tutor cell is distinct from the skill cell, so they don't share a lock"
        );
    }

    #[tokio::test]
    async fn session_cell_is_per_slug_and_stable() {
        let st = test_state();
        let a1 = st.session_cell("spanish").await;
        let a2 = st.session_cell("spanish").await;
        let b = st.session_cell("french").await;
        assert!(Arc::ptr_eq(&a1, &a2), "same slug returns the same cell");
        assert!(!Arc::ptr_eq(&a1, &b), "different slugs get different cells");
    }

    #[tokio::test]
    async fn different_slugs_run_concurrently_same_slug_serializes() {
        let st = test_state();
        let a = st.session_cell("a").await;
        let b = st.session_cell("b").await;
        // Hold a's lock: a DIFFERENT subject must still be lockable (concurrent).
        let _held = a.lock().await;
        assert!(b.try_lock().is_ok(), "different subject is not blocked");
        // A second lock on the SAME cell must fail while held (same-subject serialize).
        assert!(a.try_lock().is_err(), "same subject is serialized");
    }

    #[tokio::test]
    async fn turn_slots_bound_concurrency() {
        let st = test_state();
        // Drain all permits; the next acquire must not be immediately available.
        let mut held = Vec::new();
        for _ in 0..MAX_CONCURRENT_TURNS {
            held.push(st.turn_slots.clone().acquire_owned().await.unwrap());
        }
        assert!(
            st.turn_slots.clone().try_acquire_owned().is_err(),
            "cap reached: no further turn may start until one finishes"
        );
        drop(held.pop()); // one turn finishes
        assert!(
            st.turn_slots.clone().try_acquire_owned().is_ok(),
            "a freed slot lets the next turn start"
        );
    }

    fn manifest_json(modules: &str, assignments: &str) -> Manifest {
        let s = format!(
            r#"{{"subject":"S","slug":"s","created":"2026-06-01","updated":"2026-06-01",
                "scale":{{"start":1,"target":2}},"current":{{"status":"in-progress"}},
                "modules":{modules},"assignments":{assignments},"settings":{{}}}}"#
        );
        serde_json::from_str(&s).expect("valid manifest")
    }

    #[test]
    fn remediation_progress_requires_pending_or_mastered() {
        let m01 = ModuleId("m01".into());
        let in_progress =
            r#"[{"id":"m01","title":"t","level":1,"status":"in-progress","masteryThreshold":0.9}]"#;

        // No assignment + module in-progress → NOT progressed (the loop case we must catch).
        assert!(!remediation_progressed(
            &manifest_json(in_progress, "[]"),
            &m01
        ));

        // A fresh open drill on the module → progressed.
        let open = r#"[{"id":"a02","moduleId":"m01","type":"drill","file":"f","status":"open"}]"#;
        assert!(remediation_progressed(
            &manifest_json(in_progress, open),
            &m01
        ));

        // Mastered module (no pending) → progressed.
        let mastered =
            r#"[{"id":"m01","title":"t","level":1,"status":"mastered","masteryThreshold":0.9}]"#;
        assert!(remediation_progressed(&manifest_json(mastered, "[]"), &m01));

        // A pending drill on a DIFFERENT module does not count.
        let other = r#"[{"id":"a02","moduleId":"m02","type":"drill","file":"f","status":"open"}]"#;
        assert!(!remediation_progressed(
            &manifest_json(in_progress, other),
            &m01
        ));
    }

    #[test]
    fn milestones_fire_once_and_only_on_valid_json() {
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let mut fired = [false; 3];

        // Nothing on disk yet.
        assert!(newly_fired_milestones(d, &mut fired).is_empty());

        // Half-written knowledge-map → not valid JSON → no fire.
        fs::write(d.join("knowledge-map.json"), "{\"concepts\": [").unwrap();
        assert!(!file_is_valid_json(&d.join("knowledge-map.json")));
        assert!(newly_fired_milestones(d, &mut fired).is_empty());

        // Now valid → fires "research", exactly once.
        fs::write(d.join("knowledge-map.json"), "{\"concepts\": []}").unwrap();
        assert_eq!(
            newly_fired_milestones(d, &mut fired),
            vec!["research".to_string()]
        );
        assert!(newly_fired_milestones(d, &mut fired).is_empty());

        // Curriculum lands (placement skipped — a fixed-level start never writes
        // placement-state.json), and fires only "curriculum".
        fs::write(d.join("curriculum.json"), "{\"modules\": []}").unwrap();
        assert_eq!(
            newly_fired_milestones(d, &mut fired),
            vec!["curriculum".to_string()]
        );
    }

    #[test]
    fn milestones_fire_placement_for_test_start_then_stop() {
        // A "test" start chains research → placement-test, which writes the FIRST
        // question (placement-state.json) and STOPS for the learner — curriculum.json
        // is built only later, after placement finalizes. So the watcher fires
        // research then placement, and never curriculum this turn (it exits via abort,
        // not via fired.all()).
        let dir = tempfile::tempdir().unwrap();
        let d = dir.path();
        let mut fired = [false; 3];

        fs::write(d.join("knowledge-map.json"), "{\"concepts\": []}").unwrap();
        assert_eq!(
            newly_fired_milestones(d, &mut fired),
            vec!["research".to_string()]
        );

        fs::write(d.join("placement-state.json"), "{\"asked\": 1}").unwrap();
        assert_eq!(
            newly_fired_milestones(d, &mut fired),
            vec!["placement".to_string()]
        );

        // No curriculum this turn → the third probe never fires, so all() is never
        // satisfied for a "test" start (the watcher is aborted on return instead).
        assert!(newly_fired_milestones(d, &mut fired).is_empty());
        assert!(!fired.iter().all(|&f| f), "curriculum must stay unfired");
    }
}
