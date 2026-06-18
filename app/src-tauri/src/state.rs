//! Shared application state: the workspace root + resolved engine handles.

use std::path::PathBuf;

pub struct AppState {
    pub workspace: PathBuf,
    /// Resolved at startup; `None` if `claude` is missing (preflight fails).
    pub claude_bin: Option<PathBuf>,
    /// Staged lyceum plugin dir; `None` if staging failed.
    pub staged_plugin: Option<PathBuf>,
    /// Human-readable preflight failure, if any.
    pub preflight_error: Option<String>,
    pub model: String,
}

impl AppState {
    /// Whether the Claude bridge is usable (binary + plugin both resolved).
    pub fn engine_ready(&self) -> bool {
        self.claude_bin.is_some() && self.staged_plugin.is_some()
    }
}
