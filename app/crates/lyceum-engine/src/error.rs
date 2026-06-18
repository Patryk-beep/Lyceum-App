use thiserror::Error;

#[derive(Debug, Error)]
pub enum EngineError {
    #[error("claude binary not found")]
    ClaudeNotFound,

    #[error("spawn failed: {0}")]
    Spawn(String),

    #[error("io: {0}")]
    Io(String),

    #[error("plugin staging failed: {0}")]
    Staging(String),

    #[error("invalid plugin tree: {0}")]
    InvalidPlugin(String),

    #[error("serde: {0}")]
    Serde(String),

    #[error("core: {0}")]
    Core(String),
}

impl From<lyceum_core::CoreError> for EngineError {
    fn from(e: lyceum_core::CoreError) -> Self {
        EngineError::Core(e.to_string())
    }
}

impl From<std::io::Error> for EngineError {
    fn from(e: std::io::Error) -> Self {
        EngineError::Io(e.to_string())
    }
}

impl From<serde_json::Error> for EngineError {
    fn from(e: serde_json::Error) -> Self {
        EngineError::Serde(e.to_string())
    }
}

pub type Result<T> = std::result::Result<T, EngineError>;
