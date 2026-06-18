//! Shared application state (the resolved workspace root).

use std::path::PathBuf;

pub struct AppState {
    pub workspace: PathBuf,
}
