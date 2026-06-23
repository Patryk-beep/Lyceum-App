//! Tolerant projection of the stream-json wire format into [`BridgeEvent`]s.
//!
//! The wire is unversioned, so this NEVER errors on an unknown shape — it returns
//! no events (the caller logs a debug Warning at most). Event shapes are taken
//! from a recorded v2.1.181 transcript (`tests/fixtures/streams/skill-probe.jsonl`).

use std::collections::HashMap;

use serde_json::Value;

use crate::events::BridgeEvent;

/// Per-turn state: tracks which content-block indices are tool_use blocks so a
/// `content_block_stop` can emit a matching `ToolUseEnd`.
#[derive(Default)]
pub struct TurnState {
    tool_blocks: HashMap<u64, (String, String)>, // index -> (tool_id, name)
    pub saw_init: bool,
    pub saw_result: bool,
}

/// Extract the session_id from any line that carries one (most do).
pub fn session_id_of(v: &Value) -> Option<String> {
    v.get("session_id")
        .and_then(|s| s.as_str())
        .map(String::from)
}

/// Project one wire line into zero or more `BridgeEvent`s.
pub fn project(state: &mut TurnState, v: &Value, turn_id: u64) -> Vec<BridgeEvent> {
    let ty = v.get("type").and_then(|t| t.as_str()).unwrap_or("");
    match ty {
        "system" => project_system(state, v),
        "stream_event" => project_stream(state, v, turn_id),
        "result" => project_result(state, v, turn_id),
        // "assistant" / "user" carry no incremental UI value beyond the deltas we
        // already streamed; they are intentionally ignored for the live surface.
        _ => Vec::new(),
    }
}

fn project_system(state: &mut TurnState, v: &Value) -> Vec<BridgeEvent> {
    if v.get("subtype").and_then(|s| s.as_str()) != Some("init") {
        return Vec::new();
    }
    state.saw_init = true;
    let session_id = session_id_of(v).unwrap_or_default();
    let model = v.get("model").and_then(|m| m.as_str()).map(String::from);
    let api_key_source = v
        .get("apiKeySource")
        .and_then(|a| a.as_str())
        .map(String::from);
    let mcp_servers_empty = v
        .get("mcp_servers")
        .and_then(|m| m.as_array())
        .map(|a| a.is_empty())
        .unwrap_or(false);
    let lyceum_skills: Vec<String> = v
        .get("slash_commands")
        .and_then(|s| s.as_array())
        .map(|a| {
            a.iter()
                .filter_map(|x| x.as_str())
                .filter(|s| s.starts_with("lyceum:"))
                .map(String::from)
                .collect()
        })
        .unwrap_or_default();
    let plugin_ok = v
        .get("plugins")
        .and_then(|p| p.as_array())
        .map(|a| {
            a.iter()
                .any(|p| p.get("name").and_then(|n| n.as_str()) == Some("lyceum"))
        })
        .unwrap_or(false);

    let mut out = Vec::new();
    if let Some(src) = &api_key_source {
        if src != "none" {
            out.push(BridgeEvent::AuthWarning {
                source: src.clone(),
            });
        }
    }
    out.push(BridgeEvent::SessionInit {
        session_id,
        model,
        api_key_source,
        mcp_servers_empty,
        lyceum_skills,
        plugin_ok,
    });
    out
}

fn project_stream(state: &mut TurnState, v: &Value, turn_id: u64) -> Vec<BridgeEvent> {
    let event = match v.get("event") {
        Some(e) => e,
        None => return Vec::new(),
    };
    let etype = event.get("type").and_then(|t| t.as_str()).unwrap_or("");
    let index = event.get("index").and_then(|i| i.as_u64()).unwrap_or(0);

    match etype {
        "content_block_start" => {
            let block = event.get("content_block");
            let bt = block
                .and_then(|b| b.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            if bt == "tool_use" {
                let tool_id = block
                    .and_then(|b| b.get("id"))
                    .and_then(|i| i.as_str())
                    .unwrap_or("")
                    .to_string();
                let name = block
                    .and_then(|b| b.get("name"))
                    .and_then(|n| n.as_str())
                    .unwrap_or("")
                    .to_string();
                state
                    .tool_blocks
                    .insert(index, (tool_id.clone(), name.clone()));
                return vec![BridgeEvent::ToolUseStart {
                    turn_id,
                    block: index,
                    tool_id,
                    name,
                }];
            }
            Vec::new()
        }
        "content_block_delta" => {
            let delta = event.get("delta");
            let dt = delta
                .and_then(|d| d.get("type"))
                .and_then(|t| t.as_str())
                .unwrap_or("");
            match dt {
                "text_delta" => {
                    let text = delta
                        .and_then(|d| d.get("text"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .to_string();
                    vec![BridgeEvent::TextDelta {
                        turn_id,
                        block: index,
                        text,
                    }]
                }
                "thinking_delta" => {
                    let text = delta
                        .and_then(|d| d.get("thinking"))
                        .and_then(|t| t.as_str())
                        .unwrap_or("")
                        .to_string();
                    vec![BridgeEvent::ThinkingDelta {
                        turn_id,
                        block: index,
                        text,
                    }]
                }
                // input_json_delta fragments are accumulated by Claude into the
                // final assistant block; we don't surface partial tool args in M1.
                _ => Vec::new(),
            }
        }
        "content_block_stop" => {
            if let Some((tool_id, name)) = state.tool_blocks.remove(&index) {
                return vec![BridgeEvent::ToolUseEnd {
                    turn_id,
                    block: index,
                    tool_id,
                    name,
                }];
            }
            Vec::new()
        }
        _ => Vec::new(),
    }
}

fn project_result(state: &mut TurnState, v: &Value, turn_id: u64) -> Vec<BridgeEvent> {
    state.saw_result = true;
    let is_error = v.get("is_error").and_then(|b| b.as_bool()).unwrap_or(false);
    let stop_reason = v
        .get("stop_reason")
        .and_then(|s| s.as_str())
        .map(String::from);
    let text = v
        .get("result")
        .and_then(|r| r.as_str())
        .unwrap_or("")
        .to_string();
    let cost = v
        .get("total_cost_usd")
        .and_then(|c| c.as_f64())
        .unwrap_or(0.0);
    vec![BridgeEvent::TurnResult {
        turn_id,
        ok: !is_error,
        stop_reason,
        text,
        cost_usd_list_price: cost,
    }]
}

#[cfg(test)]
mod tests {
    use super::*;

    const FIXTURE: &str = include_str!("../../../tests/fixtures/streams/skill-probe.jsonl");

    fn lines() -> Vec<Value> {
        FIXTURE
            .lines()
            .filter(|l| !l.trim().is_empty())
            .map(|l| serde_json::from_str(l).unwrap())
            .collect()
    }

    #[test]
    fn projects_init_with_isolation_and_skills() {
        let mut state = TurnState::default();
        let init = lines()
            .into_iter()
            .find(|v| v.get("subtype").and_then(|s| s.as_str()) == Some("init"))
            .unwrap();
        let events = project(&mut state, &init, 0);
        let si = events
            .iter()
            .find_map(|e| match e {
                BridgeEvent::SessionInit {
                    mcp_servers_empty,
                    api_key_source,
                    lyceum_skills,
                    session_id,
                    ..
                } => Some((mcp_servers_empty, api_key_source, lyceum_skills, session_id)),
                _ => None,
            })
            .expect("SessionInit emitted");
        assert!(*si.0, "mcp_servers must be empty (isolation)");
        assert_eq!(si.1.as_deref(), Some("none"), "Max pool, not per-token");
        assert_eq!(si.2.len(), 11, "all 11 lyceum skills present: {:?}", si.2);
        assert!(si.2.iter().any(|s| s == "lyceum:learn"));
        assert!(si.2.iter().any(|s| s == "lyceum:remediate"));
        assert!(si.2.iter().any(|s| s == "lyceum:tutor"));
        assert!(!si.3.is_empty());
        // init must NOT trigger an auth warning when source is none
        assert!(!events
            .iter()
            .any(|e| matches!(e, BridgeEvent::AuthWarning { .. })));
    }

    #[test]
    fn streams_text_deltas_and_terminates_on_result() {
        let mut state = TurnState::default();
        let mut text = String::new();
        let mut result_text = None;
        for v in lines() {
            for ev in project(&mut state, &v, 0) {
                match ev {
                    BridgeEvent::TextDelta { text: t, .. } => text.push_str(&t),
                    BridgeEvent::TurnResult { text: t, ok, .. } => {
                        assert!(ok);
                        result_text = Some(t);
                    }
                    _ => {}
                }
            }
        }
        assert!(state.saw_init && state.saw_result);
        let rt = result_text.expect("result seen");
        // The streamed text and the authoritative result agree on the key phrase.
        assert!(rt.contains("assess-understanding"));
        assert!(text.contains("assess-understanding"));
    }

    #[test]
    fn unknown_lines_are_non_fatal() {
        let mut state = TurnState::default();
        let weird: Value = serde_json::json!({"type":"some_future_event","blob":{"x":1}});
        assert!(project(&mut state, &weird, 0).is_empty());
        let missing_type: Value = serde_json::json!({"foo":"bar"});
        assert!(project(&mut state, &missing_type, 0).is_empty());
    }

    #[test]
    fn auth_warning_when_api_key_source_set() {
        let mut state = TurnState::default();
        let init = serde_json::json!({
            "type":"system","subtype":"init","session_id":"x",
            "apiKeySource":"ANTHROPIC_API_KEY","mcp_servers":[],"model":"m"
        });
        let events = project(&mut state, &init, 0);
        assert!(events
            .iter()
            .any(|e| matches!(e, BridgeEvent::AuthWarning { .. })));
    }
}
