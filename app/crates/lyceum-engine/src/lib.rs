//! # lyceum-engine
//!
//! The Claude `stream-json` subprocess bridge. Spawns the user's local `claude`
//! as an isolated, per-subject child (Max-pool auth, no MCP, no user hooks, the
//! lyceum plugin loaded), drives turns over stdin/stdout, and projects the wire
//! into [`BridgeEvent`]s for the UI. Async (tokio); separated from `lyceum-core`
//! so the deterministic engine stays pure.

pub mod error;
pub mod events;
pub mod orchestrate;
pub mod protocol;
pub mod session;
pub mod spawn;
pub mod workspace;

pub use error::{EngineError, Result};
pub use events::BridgeEvent;
pub use orchestrate::{run_step, StepReport, TurnRunner};
pub use session::{ClaudeSession, TurnOutcome, WATCHDOG};
pub use spawn::{canonical, resolve_claude, SpawnConfig};

/// Result of the startup self-test (Settings → Diagnostics).
#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DoctorReport {
    pub ok: bool,
    pub api_key_source: Option<String>,
    pub mcp_servers_empty: bool,
    pub lyceum_skills: Vec<String>,
    pub plugin_ok: bool,
    pub result_ok: bool,
    pub session_id: Option<String>,
    pub notes: Vec<String>,
}

/// Spawn a throwaway session and fire a PONG probe, asserting the isolation +
/// skill-loading invariants. Relaxed per the M1 spike: bundled Anthropic skills
/// always coexist, so we require the 9 lyceum skills present (not "only lyceum").
pub async fn doctor(cfg: &SpawnConfig) -> Result<DoctorReport> {
    let mut session = ClaudeSession::spawn(cfg).await?;

    let mut init: Option<BridgeEvent> = None;
    let outcome = session
        .run_turn(
            "Reply with exactly the word PONG and nothing else. Do not use any tools.",
            |ev| {
                if let BridgeEvent::SessionInit { .. } = &ev {
                    init = Some(ev.clone());
                }
            },
        )
        .await?;
    session.shutdown().await;

    let mut notes = Vec::new();
    let (api_key_source, mcp_servers_empty, lyceum_skills, plugin_ok) = match init {
        Some(BridgeEvent::SessionInit {
            api_key_source,
            mcp_servers_empty,
            lyceum_skills,
            plugin_ok,
            ..
        }) => (api_key_source, mcp_servers_empty, lyceum_skills, plugin_ok),
        _ => {
            notes.push("no init event observed".to_string());
            (None, false, Vec::new(), false)
        }
    };

    let auth_ok = api_key_source.as_deref() == Some("none");
    let skills_ok = lyceum_skills.len() == workspace::LYCEUM_SKILLS.len();
    if !auth_ok {
        notes.push(format!(
            "apiKeySource={api_key_source:?} (expected \"none\" = Max pool)"
        ));
    }
    if !mcp_servers_empty {
        notes.push("mcp_servers not empty (isolation breach)".to_string());
    }
    if !skills_ok {
        notes.push(format!(
            "expected {} lyceum skills, found {}",
            workspace::LYCEUM_SKILLS.len(),
            lyceum_skills.len()
        ));
    }
    if !outcome.ok {
        notes.push(format!(
            "probe turn errored (stop_reason={:?}): {}",
            outcome.stop_reason, outcome.text
        ));
    }

    let ok = auth_ok && mcp_servers_empty && skills_ok && outcome.ok;
    Ok(DoctorReport {
        ok,
        api_key_source,
        mcp_servers_empty,
        lyceum_skills,
        plugin_ok,
        result_ok: outcome.ok,
        session_id: outcome.session_id,
        notes,
    })
}
