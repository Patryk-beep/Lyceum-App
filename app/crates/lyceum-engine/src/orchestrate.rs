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
            std::fs::write(&p, rendered)?;
            progress_written = true;
        }
    }

    Ok(StepReport {
        manifest,
        outcome,
        validation_errors,
        progress_written,
    })
}
