//! Error type for the deterministic core.

use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoreError {
    /// A value violated an invariant of the contract (e.g. Leitner box out of 1..=6).
    #[error("invalid: {0}")]
    Invalid(String),

    /// The manifest could not be parsed. `transient` distinguishes a likely
    /// half-written file (watcher path, retry) from genuine corruption.
    #[error("corrupt manifest (transient={transient}): {message}")]
    Corrupt { transient: bool, message: String },

    /// Filesystem I/O failure.
    #[error("io: {0}")]
    Io(String),

    /// Serialization failure.
    #[error("serde: {0}")]
    Serde(String),

    /// Optimistic-concurrency fingerprint mismatch: disk changed under us.
    #[error("conflict: manifest changed on disk since it was read")]
    Conflict,

    /// A required entity was not found.
    #[error("not found: {0}")]
    NotFound(String),
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        CoreError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for CoreError {
    fn from(e: serde_json::Error) -> Self {
        CoreError::Serde(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, CoreError>;
