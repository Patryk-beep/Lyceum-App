//! Building the `claude` subprocess: the proven isolated argv + the mandatory env
//! scrub + binary resolution.
//!
//! Spike-verified isolation (claude v2.1.181): `--setting-sources project`
//! suppresses ALL user hooks; `--strict-mcp-config` (with no `--mcp-config`) yields
//! `mcp_servers == []`; `--plugin-dir` loads the staged lyceum plugin and resolves
//! `${CLAUDE_PLUGIN_ROOT}/references/*`. A private `CLAUDE_CONFIG_DIR` is NOT used —
//! it breaks Max OAuth ("Not logged in"); the default config dir carries auth.

use std::path::{Path, PathBuf};
use std::process::Stdio;

use tokio::process::Command;

use crate::error::{EngineError, Result};

/// Env vars scrubbed from the child so it always draws from the Max subscription
/// pool (a present `ANTHROPIC_API_KEY` would silently bill per-token).
pub const SCRUBBED_ENV: &[&str] = &[
    "ANTHROPIC_API_KEY",
    "ANTHROPIC_AUTH_TOKEN",
    "ANTHROPIC_BASE_URL",
    "CLAUDE_CODE_USE_BEDROCK",
    "CLAUDE_CODE_USE_VERTEX",
];

#[derive(Debug, Clone)]
pub struct SpawnConfig {
    pub claude_bin: PathBuf,
    /// Canonical (realpath'd) workspace root — the child's cwd.
    pub workspace: PathBuf,
    /// Staged lyceum plugin directory (contains `.claude-plugin/plugin.json`).
    pub plugin_dir: PathBuf,
    pub model: String,
    pub resume: Option<String>,
}

impl SpawnConfig {
    /// The full argument vector (excluding the binary itself).
    pub fn to_argv(&self) -> Vec<String> {
        let mut a: Vec<String> = vec![
            "-p".into(),
            "--output-format".into(),
            "stream-json".into(),
            "--input-format".into(),
            "stream-json".into(),
            "--verbose".into(),
            "--include-partial-messages".into(),
            "--replay-user-messages".into(),
            "--dangerously-skip-permissions".into(),
            "--permission-mode".into(),
            "bypassPermissions".into(),
            "--setting-sources".into(),
            "project".into(),
            "--strict-mcp-config".into(),
            "--disallowed-tools".into(),
            "AskUserQuestion".into(),
            "--plugin-dir".into(),
            self.plugin_dir.display().to_string(),
            "--model".into(),
            self.model.clone(),
        ];
        if let Some(id) = &self.resume {
            a.push("--resume".into());
            a.push(id.clone());
        }
        a
    }

    /// Build a ready-to-spawn tokio Command (stdio piped, env scrubbed, cwd set).
    pub fn build_command(&self) -> Command {
        let mut c = Command::new(&self.claude_bin);
        c.args(self.to_argv());
        c.current_dir(&self.workspace);
        for k in SCRUBBED_ENV {
            c.env_remove(k);
        }
        c.stdin(Stdio::piped());
        c.stdout(Stdio::piped());
        c.stderr(Stdio::piped());
        #[cfg(windows)]
        {
            // Avoid a flashing console window on Windows.
            use std::os::windows::process::CommandExt;
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            c.creation_flags(CREATE_NO_WINDOW);
        }
        c
    }
}

/// Resolve the `claude` binary. Order: explicit override → common install paths →
/// PATH. The cached path should be the symlink (`~/.local/bin/claude`), not its
/// resolved versioned target, so a self-update doesn't pin a deleted directory.
pub fn resolve_claude(override_path: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = override_path {
        if p.is_file() {
            return Ok(p);
        }
    }
    let home = std::env::var("HOME").unwrap_or_default();
    let candidates = [
        format!("{home}/.local/bin/claude"),
        format!("{home}/.claude/local/claude"),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/local/bin/claude".to_string(),
    ];
    for c in candidates {
        let p = PathBuf::from(c);
        if p.is_file() {
            return Ok(p);
        }
    }
    if let Ok(path) = std::env::var("PATH") {
        for dir in std::env::split_paths(&path) {
            let p = dir.join("claude");
            if p.is_file() {
                return Ok(p);
            }
        }
    }
    Err(EngineError::ClaudeNotFound)
}

/// Realpath a path and freeze it (macOS `/tmp` -> `/private/tmp` canonicalization
/// otherwise invalidates `--resume`).
pub fn canonical(p: &Path) -> Result<PathBuf> {
    std::fs::canonicalize(p)
        .map_err(|e| EngineError::Io(format!("canonicalize {}: {e}", p.display())))
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn argv_has_proven_isolation_flags() {
        let cfg = SpawnConfig {
            claude_bin: "claude".into(),
            workspace: "/ws".into(),
            plugin_dir: "/plug".into(),
            model: "claude-opus-4-8".into(),
            resume: None,
        };
        let argv = cfg.to_argv();
        let joined = argv.join(" ");
        for needle in [
            "--strict-mcp-config",
            "--setting-sources project",
            "--plugin-dir /plug",
            "--model claude-opus-4-8",
            "--input-format stream-json",
            "--disallowed-tools AskUserQuestion",
            "--permission-mode bypassPermissions",
        ] {
            assert!(joined.contains(needle), "argv missing {needle}: {joined}");
        }
        assert!(!joined.contains("--resume"));
    }

    #[test]
    fn argv_includes_resume_when_set() {
        let cfg = SpawnConfig {
            claude_bin: "claude".into(),
            workspace: "/ws".into(),
            plugin_dir: "/plug".into(),
            model: "m".into(),
            resume: Some("sess-123".into()),
        };
        assert!(cfg.to_argv().join(" ").contains("--resume sess-123"));
    }

    #[test]
    fn scrub_list_covers_billing_vars() {
        assert!(SCRUBBED_ENV.contains(&"ANTHROPIC_API_KEY"));
        assert!(SCRUBBED_ENV.contains(&"ANTHROPIC_AUTH_TOKEN"));
    }
}
