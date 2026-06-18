//! App-facing error that serializes to a plain string for the webview.

use serde::{Serialize, Serializer};

#[derive(Debug)]
pub struct AppError(pub String);

impl AppError {
    pub fn msg(s: impl Into<String>) -> Self {
        AppError(s.into())
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(&self.0)
    }
}

impl std::error::Error for AppError {}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.0)
    }
}

impl From<lyceum_core::CoreError> for AppError {
    fn from(e: lyceum_core::CoreError) -> Self {
        AppError(e.to_string())
    }
}

impl From<std::io::Error> for AppError {
    fn from(e: std::io::Error) -> Self {
        AppError(format!("io: {e}"))
    }
}

impl From<serde_json::Error> for AppError {
    fn from(e: serde_json::Error) -> Self {
        AppError(format!("json: {e}"))
    }
}

pub type AppResult<T> = Result<T, AppError>;
