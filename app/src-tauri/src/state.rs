//! Shared application state: the workspace root, resolved engine handles, and the
//! per-subject warm session map.

use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;

use lyceum_engine::ClaudeSession;
use tokio::sync::{Mutex, Semaphore};

/// Max concurrent live `claude` turns across all subjects. The old single global
/// lock bounded this implicitly; per-slug locks remove that bound, so a semaphore
/// keeps the number of live children sane. ponytail: cap = 4, raise if users want
/// more subjects running at once.
pub const MAX_CONCURRENT_TURNS: usize = 4;

/// Max concurrent live TUTOR turns (a separate pool from skill turns so a chatty learner
/// can't starve the curriculum engine, and vice-versa). Each subject can hold a tutor child
/// AND a skill child at once, so total live children ≤ MAX_CONCURRENT_TURNS + this.
pub const MAX_CONCURRENT_TUTOR: usize = 2;

/// One lazily-spawned warm `claude` child per subject, behind its own async lock.
pub type SessionCell = Arc<Mutex<Option<ClaudeSession>>>;

pub struct AppState {
    pub workspace: PathBuf,
    /// Resolved at startup; `None` if `claude` is missing (preflight fails).
    pub claude_bin: Option<PathBuf>,
    /// Staged lyceum plugin dir; `None` if staging failed.
    pub staged_plugin: Option<PathBuf>,
    /// Human-readable preflight failure, if any.
    pub preflight_error: Option<String>,
    pub model: String,
    /// Per-subject session cell. The OUTER map lock is held only to get-or-insert a
    /// cell; the per-cell lock is held across a turn, so different subjects run
    /// concurrently while same-subject turns serialize on the same cell.
    pub sessions: Mutex<HashMap<String, SessionCell>>,
    /// Bounds concurrent live turns (see [`MAX_CONCURRENT_TURNS`]).
    pub turn_slots: Arc<Semaphore>,
    /// Per-subject TUTOR session cell — a SECOND warm child per subject, distinct from the
    /// skill cell, so a tutor turn and a skill turn for the same subject run on different
    /// locks (concurrently) instead of serializing.
    pub tutor_sessions: Mutex<HashMap<String, SessionCell>>,
    /// Bounds concurrent live tutor turns (see [`MAX_CONCURRENT_TUTOR`]).
    pub tutor_slots: Arc<Semaphore>,
}

impl AppState {
    /// Whether the Claude bridge is usable (binary + plugin both resolved).
    pub fn engine_ready(&self) -> bool {
        self.claude_bin.is_some() && self.staged_plugin.is_some()
    }

    /// Get (or lazily create) the session cell for `slug`, holding the map lock only
    /// for the entry/clone (never across a turn).
    pub async fn session_cell(&self, slug: &str) -> SessionCell {
        let mut map = self.sessions.lock().await;
        map.entry(slug.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(None)))
            .clone()
    }

    /// Get (or lazily create) the TUTOR session cell for `slug` — a distinct cell from
    /// [`session_cell`], so tutor and skill turns for one subject don't share a lock.
    pub async fn tutor_session_cell(&self, slug: &str) -> SessionCell {
        let mut map = self.tutor_sessions.lock().await;
        map.entry(slug.to_string())
            .or_insert_with(|| Arc::new(Mutex::new(None)))
            .clone()
    }
}
