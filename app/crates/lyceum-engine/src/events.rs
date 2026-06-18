//! The projected event union emitted to the UI on `claude://<slug>`.
//!
//! Tagged `{ "kind": "...", "data": { ... } }` so the TS side can switch on `kind`.

use serde::Serialize;

#[derive(Debug, Clone, PartialEq, Serialize)]
#[serde(
    tag = "kind",
    content = "data",
    rename_all = "camelCase",
    rename_all_fields = "camelCase"
)]
pub enum BridgeEvent {
    /// First event of a session: the `system/init` line.
    SessionInit {
        session_id: String,
        model: Option<String>,
        api_key_source: Option<String>,
        mcp_servers_empty: bool,
        /// `lyceum:*` skills present in `slash_commands`.
        lyceum_skills: Vec<String>,
        plugin_ok: bool,
    },
    /// The child is authing per-token, not via the Max pool. Billing leak warning.
    AuthWarning {
        source: String,
    },
    TurnStarted {
        turn_id: u64,
    },
    TextDelta {
        turn_id: u64,
        block: u64,
        text: String,
    },
    ThinkingDelta {
        turn_id: u64,
        block: u64,
        text: String,
    },
    ToolUseStart {
        turn_id: u64,
        block: u64,
        tool_id: String,
        name: String,
    },
    ToolUseEnd {
        turn_id: u64,
        block: u64,
        tool_id: String,
        name: String,
    },
    /// Terminal event of a turn (from the `result` line).
    TurnResult {
        turn_id: u64,
        ok: bool,
        stop_reason: Option<String>,
        text: String,
        /// `total_cost_usd` — a NOTIONAL list price even on the Max pool. Never
        /// render this as a dollar charge when `api_key_source == "none"`.
        cost_usd_list_price: f64,
    },
    Warning {
        message: String,
    },
    Fatal {
        kind: String,
        message: String,
    },
}
