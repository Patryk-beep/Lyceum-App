//! Tauri commands for the Claude bridge (M1). Events stream on `claude://session`.

use tauri::{AppHandle, Emitter, State};

use lyceum_engine::{canonical, doctor, ClaudeSession, DoctorReport, SpawnConfig};

use crate::error::{AppError, AppResult};
use crate::state::AppState;

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
