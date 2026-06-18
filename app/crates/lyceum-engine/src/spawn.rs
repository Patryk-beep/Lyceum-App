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
            // Avoid a flashing console window on Windows. `creation_flags` is inherent
            // on tokio's Command (no `std::os::windows::process::CommandExt` import needed).
            const CREATE_NO_WINDOW: u32 = 0x0800_0000;
            c.creation_flags(CREATE_NO_WINDOW);
        }
        c
    }
}

/// Unix install candidates, in priority order. Pure (takes `$HOME` as a param) so it
/// unit-tests on any host.
#[cfg_attr(windows, allow(dead_code))]
fn unix_candidates(home: &str) -> Vec<PathBuf> {
    [
        format!("{home}/.local/bin/claude"),
        format!("{home}/.claude/local/claude"),
        "/opt/homebrew/bin/claude".to_string(),
        "/usr/local/bin/claude".to_string(),
    ]
    .into_iter()
    .map(PathBuf::from)
    .collect()
}

/// Windows install candidates, in priority order. `.exe` is preferred over `.cmd` so
/// we spawn the native binary directly and avoid the implicit `cmd.exe` escaping path.
/// Native installer → `%USERPROFILE%\.local\bin\claude.exe`; WinGet → the Links shim;
/// npm-global → `%APPDATA%\npm\claude.cmd`. Pure (env passed in) so it tests on macOS.
#[cfg_attr(not(windows), allow(dead_code))]
fn windows_candidates(
    userprofile: Option<&str>,
    appdata: Option<&str>,
    localappdata: Option<&str>,
) -> Vec<PathBuf> {
    let mut v = Vec::new();
    if let Some(up) = userprofile {
        v.push(PathBuf::from(format!(r"{up}\.local\bin\claude.exe")));
        v.push(PathBuf::from(format!(r"{up}\.claude\local\claude.exe")));
    }
    if let Some(la) = localappdata {
        v.push(PathBuf::from(format!(
            r"{la}\Microsoft\WinGet\Links\claude.exe"
        )));
    }
    if let Some(ad) = appdata {
        v.push(PathBuf::from(format!(r"{ad}\npm\claude.cmd")));
        v.push(PathBuf::from(format!(r"{ad}\npm\claude.exe")));
    }
    v
}

/// Resolve the `claude` binary. Order: explicit override → common install paths →
/// `which` (PATH lookup that honors PATHEXT, so it finds `claude.exe`/`.cmd`). The
/// dir-probe is primary because Windows PATH is unreliable (Claude bug 42337) and an
/// empty PATHEXT can defeat `which`; dir existence is never trusted (always check the FILE).
pub fn resolve_claude(override_path: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(p) = override_path {
        if p.is_file() {
            return Ok(p);
        }
    }
    #[cfg(windows)]
    let candidates = {
        let up = std::env::var("USERPROFILE").ok();
        let ad = std::env::var("APPDATA").ok();
        let la = std::env::var("LOCALAPPDATA").ok();
        windows_candidates(up.as_deref(), ad.as_deref(), la.as_deref())
    };
    #[cfg(not(windows))]
    let candidates = unix_candidates(&std::env::var("HOME").unwrap_or_default());

    for p in candidates {
        if p.is_file() {
            return Ok(p);
        }
    }
    // Best-effort last resort: PATH lookup that honors PATHEXT (finds claude.exe/.cmd).
    if let Ok(p) = which::which("claude") {
        return Ok(p);
    }
    Err(EngineError::ClaudeNotFound)
}

/// Realpath a path and freeze it (macOS `/tmp` -> `/private/tmp` canonicalization
/// otherwise invalidates `--resume`). `dunce` strips the Windows `\\?\` verbatim
/// prefix so the child cwd / CLI args stay compatible (on Unix it's a pass-through,
/// preserving the realpath behavior `--resume` depends on).
pub fn canonical(p: &Path) -> Result<PathBuf> {
    dunce::canonicalize(p)
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

    fn strs(v: &[PathBuf]) -> Vec<String> {
        v.iter().map(|p| p.to_string_lossy().into_owned()).collect()
    }

    #[test]
    fn windows_candidates_prefers_exe_then_cmd() {
        let v = windows_candidates(
            Some(r"C:\Users\Jo"),
            Some(r"C:\Users\Jo\AppData\Roaming"),
            Some(r"C:\Users\Jo\AppData\Local"),
        );
        assert_eq!(
            strs(&v),
            vec![
                r"C:\Users\Jo\.local\bin\claude.exe".to_string(),
                r"C:\Users\Jo\.claude\local\claude.exe".to_string(),
                r"C:\Users\Jo\AppData\Local\Microsoft\WinGet\Links\claude.exe".to_string(),
                r"C:\Users\Jo\AppData\Roaming\npm\claude.cmd".to_string(),
                r"C:\Users\Jo\AppData\Roaming\npm\claude.exe".to_string(),
            ]
        );
        // The native .exe is preferred over the npm .cmd (avoids the cmd.exe escaping path).
        let s = strs(&v);
        let exe = s
            .iter()
            .position(|x| x.ends_with(r"\.local\bin\claude.exe"))
            .unwrap();
        let cmd = s
            .iter()
            .position(|x| x.ends_with(r"npm\claude.cmd"))
            .unwrap();
        assert!(exe < cmd);
    }

    #[test]
    fn windows_candidates_skips_missing_env() {
        // No USERPROFILE / LOCALAPPDATA → only the APPDATA-derived npm entries remain, no panic.
        let v = windows_candidates(None, Some(r"C:\AD"), None);
        assert_eq!(
            strs(&v),
            vec![
                r"C:\AD\npm\claude.cmd".to_string(),
                r"C:\AD\npm\claude.exe".to_string(),
            ]
        );
        assert!(windows_candidates(None, None, None).is_empty());
    }

    #[test]
    fn unix_candidates_unchanged() {
        assert_eq!(
            strs(&unix_candidates("/home/u")),
            vec![
                "/home/u/.local/bin/claude".to_string(),
                "/home/u/.claude/local/claude".to_string(),
                "/opt/homebrew/bin/claude".to_string(),
                "/usr/local/bin/claude".to_string(),
            ]
        );
    }

    #[cfg(windows)]
    #[test]
    fn resolve_does_not_panic_without_claude() {
        // On a runner without Claude installed, resolve either finds it via `which`
        // or returns ClaudeNotFound — it must never panic and must reach the fallback.
        let _ = resolve_claude(None);
    }
}
