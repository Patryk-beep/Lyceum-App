//! Tauri commands for the Claude bridge. Events stream on `claude://session`.

use tauri::{AppHandle, Emitter, State};

use lyceum_core::model::Manifest;
use lyceum_core::routing::derive_route;
use lyceum_engine::{canonical, doctor, run_step, ClaudeSession, DoctorReport, SpawnConfig};

use crate::error::{AppError, AppResult};
use crate::prompts::prompt_for;
use crate::state::AppState;
use crate::workspace;

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

fn spawn_config(state: &AppState, resume: Option<String>) -> AppResult<SpawnConfig> {
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
    })
}

#[tauri::command]
pub async fn claude_doctor(state: State<'_, AppState>) -> AppResult<DoctorReport> {
    let cfg = spawn_config(state.inner(), None)?;
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
    let cfg = spawn_config(state.inner(), None)?;
    let mut session = ClaudeSession::spawn(&cfg)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    let app2 = app.clone();
    let outcome = session
        .run_turn(&prompt, move |ev| {
            let _ = app2.emit("claude://session", ev);
        })
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    session.shutdown().await;
    Ok(outcome.text)
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
    crate::service::scaffold_subject_dirs(&subject_dir).map_err(|e| AppError::msg(e.to_string()))?;

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

    let cfg = spawn_config(state.inner(), None)?;
    let app2 = app.clone();
    let mut on_event = move |ev: lyceum_engine::BridgeEvent| {
        let _ = app2.emit("claude://session", ev);
    };
    let mut sessions = state.sessions.lock().await;
    let session = ClaudeSession::spawn(&cfg)
        .await
        .map_err(|e| AppError::msg(e.to_string()))?;
    sessions.insert(slug.clone(), session);
    let session = sessions.get_mut(&slug).unwrap();

    let report = run_step(
        session,
        &state.workspace,
        &slug,
        &prompt,
        today,
        &mut on_event,
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;
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

    let cfg = spawn_config(state.inner(), None)?;
    let app2 = app.clone();
    let mut on_event = move |ev: lyceum_engine::BridgeEvent| {
        let _ = app2.emit("claude://session", ev);
    };

    let mut sessions = state.sessions.lock().await;
    if !sessions.contains_key(&slug) {
        let session = ClaudeSession::spawn(&cfg)
            .await
            .map_err(|e| AppError::msg(e.to_string()))?;
        sessions.insert(slug.clone(), session);
    }
    let session = sessions.get_mut(&slug).expect("session present");

    let report = run_step(
        session,
        &state.workspace,
        &slug,
        &prompt,
        today,
        &mut on_event,
    )
    .await
    .map_err(|e| AppError::msg(e.to_string()))?;

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
