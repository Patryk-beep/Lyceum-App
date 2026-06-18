//! The per-step generative cycle: run a turn → reload manifest → reload-validator
//! → regenerate progress.md. Turns go through the [`TurnRunner`] trait so the slice
//! can be replayed deterministically against a scripted fake (no live Claude).

use std::path::{Path, PathBuf};
use std::time::Duration;

use async_trait::async_trait;
use time::Date;

use lyceum_core::model::Manifest;
use lyceum_core::routing::{derive_route, DiskState};
use lyceum_core::{progress, srs, store, validate, CoreError};

use crate::error::{EngineError, Result};
use crate::events::BridgeEvent;
use crate::session::{ClaudeSession, TurnOutcome};

/// Anything that can run a turn: the live `ClaudeSession`, or a scripted fake.
#[async_trait]
pub trait TurnRunner: Send {
    async fn turn(
        &mut self,
        prompt: &str,
        on_event: &mut (dyn FnMut(BridgeEvent) + Send),
    ) -> Result<TurnOutcome>;
}

#[async_trait]
impl TurnRunner for ClaudeSession {
    async fn turn(
        &mut self,
        prompt: &str,
        on_event: &mut (dyn FnMut(BridgeEvent) + Send),
    ) -> Result<TurnOutcome> {
        self.run_turn(prompt, on_event).await
    }
}

#[derive(Debug)]
pub struct StepReport {
    pub manifest: Option<Manifest>,
    pub outcome: TurnOutcome,
    pub validation_errors: Vec<String>,
    pub progress_written: bool,
}

impl StepReport {
    pub fn is_valid(&self) -> bool {
        self.validation_errors.is_empty()
    }
}

pub fn manifest_path(workspace: &Path, slug: &str) -> PathBuf {
    workspace.join("learning").join(slug).join("manifest.json")
}

fn disk_state(workspace: &Path, slug: &str) -> DiskState {
    let dir = workspace.join("learning").join(slug);
    DiskState {
        has_research: dir.join("research.md").is_file(),
        has_knowledge_map: dir.join("knowledge-map.json").is_file(),
        has_curriculum_json: dir.join("curriculum.json").is_file(),
    }
}

/// Reload the manifest, retrying a transient (half-written) corrupt read.
async fn load_with_retry(path: &Path) -> Result<Option<Manifest>> {
    if !path.exists() {
        return Ok(None);
    }
    for attempt in 0..3 {
        match store::load(path) {
            Ok(m) => return Ok(Some(m)),
            Err(CoreError::Corrupt {
                transient: true, ..
            }) if attempt < 2 => {
                tokio::time::sleep(Duration::from_millis(100)).await;
            }
            Err(e) => return Err(EngineError::Core(e.to_string())),
        }
    }
    Ok(None)
}

/// Best-effort write of the derived `progress.md`: retry briefly on a transient lock
/// (Windows AV/indexer), then give up SILENTLY — it is re-rendered next turn, so a
/// stale/missing render must never fail a valid turn. Returns whether it wrote.
fn write_progress_best_effort(path: &Path, contents: &str) -> bool {
    for attempt in 0..5u32 {
        if std::fs::write(path, contents).is_ok() {
            return true;
        }
        if attempt + 1 < 5 {
            std::thread::sleep(Duration::from_millis(10 * u64::from(attempt + 1)));
        }
    }
    false
}

/// Dispatch one step. The runner performs the turn (writing manifest/artifacts);
/// we then re-read disk truth, validate it, and regenerate `progress.md`. The
/// caller must HALT (surface "re-run step") when `validation_errors` is non-empty.
pub async fn run_step(
    runner: &mut dyn TurnRunner,
    workspace: &Path,
    slug: &str,
    prompt: &str,
    today: Date,
    on_event: &mut (dyn FnMut(BridgeEvent) + Send),
) -> Result<StepReport> {
    let outcome = runner.turn(prompt, on_event).await?;

    let path = manifest_path(workspace, slug);
    let manifest = load_with_retry(&path).await?;
    let validation_errors = manifest
        .as_ref()
        .map(validate::validate)
        .unwrap_or_default();

    let mut progress_written = false;
    if let Some(m) = &manifest {
        if validation_errors.is_empty() {
            let disk = disk_state(workspace, slug);
            let decision = derive_route(m, &disk);
            let reviews_due = srs::due_count(&m.review_queue, today);
            let rendered = progress::render_progress(m, &decision.why, reviews_due);
            let p = workspace.join("learning").join(slug).join("progress.md");
            // Best-effort: progress.md is derived (re-rendered every turn), so a transient
            // write failure (Windows AV/indexer lock) must NOT fail an otherwise-valid turn.
            progress_written = write_progress_best_effort(&p, &rendered);
        }
    }

    Ok(StepReport {
        manifest,
        outcome,
        validation_errors,
        progress_written,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn progress_write_is_non_fatal_when_dir_missing() {
        // The parent dir does not exist → every attempt fails, but the best-effort write
        // returns `false` instead of panicking or propagating (a turn must still succeed).
        let tmp = tempfile::tempdir().unwrap();
        let missing = tmp.path().join("no").join("such").join("progress.md");
        assert!(!write_progress_best_effort(&missing, "x"));
    }

    #[test]
    fn progress_write_succeeds_for_a_valid_path() {
        let tmp = tempfile::tempdir().unwrap();
        let p = tmp.path().join("progress.md");
        assert!(write_progress_best_effort(&p, "hello"));
        assert_eq!(std::fs::read_to_string(&p).unwrap(), "hello");
    }
}
