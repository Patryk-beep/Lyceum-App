//! Lyceum-App Tauri shell. Resolves the workspace, runs preflight (resolve claude +
//! stage the lyceum plugin), manages state, and exposes the engine + bridge commands.

mod commands;
mod engine_cmds;
mod error;
mod prompts;
mod service;
mod state;
mod workspace;

use std::path::PathBuf;

use tauri::path::BaseDirectory;
use tauri::Manager;

use state::AppState;

const MODEL: &str = "claude-opus-4-8";

/// Locate the bundled lyceum plugin: the Tauri resource dir in a packaged app, or
/// the compile-time `resources/` dir in `tauri dev`.
fn locate_plugin_source(app: &tauri::App) -> Option<PathBuf> {
    if let Ok(p) = app
        .path()
        .resolve("resources/lyceum", BaseDirectory::Resource)
    {
        if p.join(".claude-plugin/plugin.json").is_file() {
            return Some(p);
        }
    }
    let dev = PathBuf::from(env!("CARGO_MANIFEST_DIR")).join("resources/lyceum");
    if dev.join(".claude-plugin/plugin.json").is_file() {
        return Some(dev);
    }
    None
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let base = app
                .path()
                .app_local_data_dir()
                .map_err(|e| format!("cannot resolve app data dir: {e}"))?;
            let workspace = base.join("workspace");
            service::ensure_workspace(&workspace)?;

            // Preflight: resolve the claude binary and stage the plugin.
            let claude_bin = lyceum_engine::resolve_claude(None).ok();
            let (staged_plugin, mut preflight_error) = match locate_plugin_source(app) {
                Some(src) => {
                    let stage_dir = workspace.join(".lyceum").join("plugins");
                    match lyceum_engine::workspace::stage_plugin(&src, &stage_dir) {
                        Ok(p) => (Some(p), None),
                        Err(e) => (None, Some(format!("plugin staging failed: {e}"))),
                    }
                }
                None => (None, Some("bundled lyceum plugin not found".to_string())),
            };
            if claude_bin.is_none() {
                preflight_error =
                    Some("claude binary not found — install Claude Code and log in".to_string());
            }

            app.manage(AppState {
                workspace,
                claude_bin,
                staged_plugin,
                preflight_error,
                model: MODEL.to_string(),
                sessions: Default::default(),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace_info,
            commands::list_subjects,
            commands::read_manifest,
            commands::compute_next_step,
            commands::regenerate_progress,
            commands::seed_demo,
            commands::review_due,
            commands::review_grade,
            commands::subject_analytics,
            commands::read_artifact,
            commands::placement_pool,
            commands::placement_step,
            commands::placement_finalize,
            commands::get_levels,
            engine_cmds::preflight,
            engine_cmds::claude_doctor,
            engine_cmds::claude_smoke,
            engine_cmds::run_subject_step,
            engine_cmds::create_subject,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
