//! Lyceum-App Tauri shell. Owns no business logic — it resolves the workspace,
//! manages state, and exposes the engine commands. (The Claude bridge arrives in M1.)

mod commands;
mod error;
mod service;
mod state;
mod workspace;

use tauri::Manager;

use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let base = app
                .path()
                .app_local_data_dir()
                .map_err(|e| format!("cannot resolve app data dir: {e}"))?;
            let workspace = base.join("workspace");
            service::ensure_workspace(&workspace)?;
            app.manage(AppState { workspace });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::workspace_info,
            commands::list_subjects,
            commands::read_manifest,
            commands::compute_next_step,
            commands::regenerate_progress,
            commands::seed_demo,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
