//! A long-lived `claude` child driven over stdin/stdout. stdin stays OPEN across
//! the turn (closing it early aborts the turn — a spike finding); the child lives
//! across turns so `--resume` keeps the same thread + cwd.

use std::time::Duration;

use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader, Lines};
use tokio::process::{Child, ChildStdin, ChildStdout};

use crate::error::{EngineError, Result};
use crate::events::BridgeEvent;
use crate::protocol::{project, TurnState};
use crate::spawn::SpawnConfig;

/// No-bytes idle timeout. Reset on every line read.
pub const WATCHDOG: Duration = Duration::from_secs(120);

#[derive(Debug, Clone)]
pub struct TurnOutcome {
    pub session_id: Option<String>,
    pub ok: bool,
    pub stop_reason: Option<String>,
    pub text: String,
    pub cost_usd_list_price: f64,
}

pub struct ClaudeSession {
    child: Child,
    stdin: ChildStdin,
    stdout: Lines<BufReader<ChildStdout>>,
    pub session_id: Option<String>,
    next_turn: u64,
}

impl ClaudeSession {
    pub async fn spawn(cfg: &SpawnConfig) -> Result<Self> {
        let mut cmd = cfg.build_command();
        let mut child = cmd.spawn().map_err(|e| EngineError::Spawn(e.to_string()))?;
        let stdin = child
            .stdin
            .take()
            .ok_or_else(|| EngineError::Spawn("child has no stdin".into()))?;
        let stdout = child
            .stdout
            .take()
            .ok_or_else(|| EngineError::Spawn("child has no stdout".into()))?;
        let lines = BufReader::new(stdout).lines();
        Ok(Self {
            child,
            stdin,
            stdout: lines,
            session_id: None,
            next_turn: 0,
        })
    }

    /// Dispatch one turn: write the user message, then read NDJSON until `result`.
    /// Each projected `BridgeEvent` is handed to `on_event` in order.
    pub async fn run_turn(
        &mut self,
        prompt: &str,
        mut on_event: impl FnMut(BridgeEvent),
    ) -> Result<TurnOutcome> {
        let turn_id = self.next_turn;
        self.next_turn += 1;
        on_event(BridgeEvent::TurnStarted { turn_id });

        let msg = serde_json::json!({
            "type": "user",
            "message": { "role": "user", "content": prompt }
        });
        let mut line = serde_json::to_string(&msg)?;
        line.push('\n');
        self.stdin.write_all(line.as_bytes()).await?;
        self.stdin.flush().await?;

        let mut state = TurnState::default();
        loop {
            match tokio::time::timeout(WATCHDOG, self.stdout.next_line()).await {
                Err(_timeout) => {
                    on_event(BridgeEvent::Warning {
                        message: "watchdog: no output for 120s; killing turn".into(),
                    });
                    let _ = self.child.start_kill();
                    return Ok(TurnOutcome {
                        session_id: self.session_id.clone(),
                        ok: false,
                        stop_reason: Some("watchdog".into()),
                        text: String::new(),
                        cost_usd_list_price: 0.0,
                    });
                }
                Ok(Ok(Some(raw))) => {
                    let v: serde_json::Value = match serde_json::from_str(&raw) {
                        Ok(v) => v,
                        Err(_) => {
                            on_event(BridgeEvent::Warning {
                                message: "skipped unparsable line".into(),
                            });
                            continue;
                        }
                    };
                    for ev in project(&mut state, &v, turn_id) {
                        if let BridgeEvent::SessionInit { session_id, .. } = &ev {
                            if !session_id.is_empty() {
                                self.session_id = Some(session_id.clone());
                            }
                        }
                        if let BridgeEvent::TurnResult {
                            ok,
                            stop_reason,
                            text,
                            cost_usd_list_price,
                            ..
                        } = &ev
                        {
                            let outcome = TurnOutcome {
                                session_id: self.session_id.clone(),
                                ok: *ok,
                                stop_reason: stop_reason.clone(),
                                text: text.clone(),
                                cost_usd_list_price: *cost_usd_list_price,
                            };
                            on_event(ev);
                            return Ok(outcome);
                        }
                        on_event(ev);
                    }
                }
                Ok(Ok(None)) => {
                    // EOF: the child closed stdout (died / exited).
                    return Ok(TurnOutcome {
                        session_id: self.session_id.clone(),
                        ok: false,
                        stop_reason: Some("child-died".into()),
                        text: String::new(),
                        cost_usd_list_price: 0.0,
                    });
                }
                Ok(Err(e)) => return Err(EngineError::Io(e.to_string())),
            }
        }
    }

    /// Close stdin and wait for the child to exit.
    pub async fn shutdown(mut self) {
        drop(self.stdin);
        let _ = self.child.wait().await;
    }
}
