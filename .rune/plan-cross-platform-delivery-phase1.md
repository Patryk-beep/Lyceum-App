# Phase 1 — Windows Bridge Core

**Goal:** the Claude subprocess resolves and spawns correctly on Windows, with no macOS regression.
**Why this is the heart:** today `resolve_claude` uses `$HOME` + hardcoded unix paths + a bare `claude`
filename, so `preflight()` finds nothing on Windows and blocks launch. Fix the resolver, the spawn
program form, and the `\\?\` path problem.
**(Hardened 2026-06-18 by a 5-lens red-team — see inline ⚑ markers.)**

## Research facts this phase encodes (all confidence: high)
- Native Claude on Windows = **`claude.exe`** at `%USERPROFILE%\.local\bin\claude.exe` (self-contained PE).
- npm-global Claude = **`claude.cmd`** at `%APPDATA%\npm\claude.cmd` (the npm prefix itself; NO `\bin` subdir).
- WinGet Claude (`Anthropic.ClaudeCode`) lands on PATH via the shim dir **`%LOCALAPPDATA%\Microsoft\WinGet\Links`**.
- `std`/`tokio` `Command::new("claude")` appends only `.exe`, **never** PATHEXT → will MISS `claude.cmd`.
  Pass a full path WITH extension, or resolve via the `which` crate (which honors PATHEXT).
- A `.cmd`/`.bat` path handed to `Command` is auto-run via `cmd.exe` with cmd-rules escaping (Rust ≥1.77.2),
  and `spawn()` returns `ErrorKind::InvalidInput` if an arg can't be safely escaped. → **prefer `.exe`**.
  (Residual risk is tiny: the turn PROMPT goes over stdin, NOT argv. Only `--plugin-dir <path>` + `--model`
  are path/arg-like, and the slug is already slugified — so an unescapable arg is essentially impossible.)
- `std::fs::canonicalize` returns a `\\?\C:\…` verbatim path that breaks a child's `current_dir` → use
  `dunce::canonicalize` (on Unix it's a pass-through, so the existing `/tmp→/private/tmp` realpath that
  `--resume` relies on is PRESERVED — ⚑ verified no macOS regression).
- PATH is unreliable on Windows (Claude bug 42337) → probe known dirs FIRST, then PATH. Dir existence ≠
  binary exists (bug 14942) → always check the FILE.

## Data Flow
```
preflight (lib.rs setup) → resolve_claude(None) [spawn.rs]
  → candidates_for_host(env)  (PURE, host-agnostic, unit-tested on mac)
  → first candidate that is_file()  → PathBuf
  → else which::which("claude")  (PATHEXT-aware best-effort)  → PathBuf
  → else Err(ClaudeNotFound)
SpawnConfig.workspace = canonical(ws) [engine_cmds.rs] → canonical() = dunce::canonicalize → no \\?\ prefix
build_command(): Command::new(claude_bin) … (unchanged; cfg(windows) CREATE_NO_WINDOW already present)
```

## Code Contracts
```rust
// spawn.rs — pure generators (NOT cfg-gated, so both compile + unit-test on macOS):
#[cfg_attr(not(windows), allow(dead_code))]                      // ⚑ avoids clippy -D dead_code off-Windows
fn windows_candidates(userprofile: Option<&str>, appdata: Option<&str>, localappdata: Option<&str>) -> Vec<PathBuf>;
//   order (prefer .exe to dodge the cmd.exe escaping path):
//     {userprofile}\.local\bin\claude.exe
//     {userprofile}\.claude\local\claude.exe
//     {localappdata}\Microsoft\WinGet\Links\claude.exe          // ⚑ real WinGet shim (was a wrong guess)
//     {appdata}\npm\claude.cmd                                  // npm-global
//     {appdata}\npm\claude.exe                                  // defensive
#[cfg_attr(windows, allow(dead_code))]
fn unix_candidates(home: &str) -> Vec<PathBuf>;                  // = the 4 existing paths, verbatim
pub fn resolve_claude(override_path: Option<PathBuf>) -> Result<PathBuf>;   // signature UNCHANGED
pub fn canonical(p: &Path) -> Result<PathBuf>;                  // signature UNCHANGED; body → dunce::canonicalize
```
- `resolve_claude`: `#[cfg(windows)]` selects `windows_candidates(env USERPROFILE/APPDATA/LOCALAPPDATA)`;
  `#[cfg(not(windows))]` selects `unix_candidates(env HOME)`. Probe `is_file()`; then `which::which("claude").ok()`.
  ⚑ `which` is a BEST-EFFORT LAST RESORT (it needs PATHEXT to find `.cmd`; if PATHEXT is empty it may miss) —
  the explicit dir-probe with literal extensions is the PRIMARY resolver, so an empty PATHEXT is non-fatal.
- ⚑ `dunce` and `which` are called on **all** platforms (dunce in `canonical()`, `which` in the fallback) → no
  unused-dependency warning on macOS/Linux.
- Deps in `app/crates/lyceum-engine/Cargo.toml`: `which = "7"`, `dunce = "1"`.
- ⚑ **`app/rust-toolchain.toml` ALREADY EXISTS** (`channel="stable"`, components rustfmt+clippy). DO NOT
  recreate it. "stable" is already ≫1.77.2 (BatBadBut fix guaranteed). ONLY add a `targets` line:
  `targets = ["x86_64-pc-windows-msvc"]` (keep channel + components). Add a comment: "≥1.77.2 floor for the
  BatBadBut .cmd escaping fix".

## Tasks
1. **`spawn.rs`** — extract the existing unix paths into `unix_candidates` (byte-identical). Add
   `windows_candidates` per the order above. Rewrite `resolve_claude` to cfg-select + keep override/`is_file`
   probe + add the `which` fallback. Empty/missing env var → skip that candidate (no panic). Add the two
   `#[cfg_attr(... allow(dead_code))]` attributes.
2. **`spawn.rs`** — `canonical()` body → `dunce::canonicalize(p)` (same error mapping + 1-line comment).
3. **`Cargo.toml`** — add `which`, `dunce`. **`app/rust-toolchain.toml`** — EDIT to add the `targets` line.
4. **`.gitattributes`** (repo root or `app/`) — add `app/src-tauri/resources/lyceum/** text eol=lf` so a
   Windows checkout can't CRLF-mangle the bundled plugin markdown that `--plugin-dir` ships. ⚑ (completeness)
5. **`spawn.rs` tests** — see Test tasks. Keep the 3 existing tests passing unchanged.
6. **`app-ci.yml`** — add a **required** `windows` job (`runs-on: windows-latest`, `working-directory: app`):
   rust-toolchain, `cargo test -p lyceum-core -p lyceum-engine`, `cargo clippy -p lyceum-engine --all-targets
   -- -D warnings`. ⚑ This is the ONLY real exercise of the `.cmd`/`build_command` link path — local
   `cargo check --target …-msvc` type-checks but does NOT link/spawn, so the Windows job is non-optional.

## Failure Scenarios
| When | Then | Error/handling |
|---|---|---|
| `USERPROFILE` unset on Windows | skip that candidate; try the rest, then `which` | no panic (guarded `Option`) |
| Only `claude.cmd` present (npm) | resolve it; std runs it via `cmd.exe`+escaping | if an arg can't escape → surface `InvalidInput` (don't swallow); near-impossible given args |
| Claude installed via WinGet | known shim path or `which` finds it | resolved |
| `claude` only on PATH | `which::which` finds it (PATHEXT-aware) | resolved |
| PATHEXT empty + only `.cmd` on PATH | `which` may miss it | acceptable — dir-probe is primary; preflight shows install hint |
| nothing found | `Err(ClaudeNotFound)` → `preflight.error` hint | existing behavior preserved |

## Rejection Criteria (DO NOT)
- DO NOT change `resolve_claude`/`canonical` signatures or `SpawnConfig`/`build_command` shape.
- DO NOT build a `cmd.exe /C` wrapper or use `raw_arg` (re-opens the BatBadBut injection hole).
- DO NOT `#[cfg]` the env reads inside the pure generators — they take params so they test on macOS.
- DO NOT add PATHEXT iteration by hand — use the `which` crate. DO NOT touch scrub list / argv / isolation flags.
- ⚑ DO NOT recreate `rust-toolchain.toml` or change its `channel`/`components`. DO NOT make the Windows CI job optional.

## Cross-Phase Context
- **Assumes:** nothing from later phases.
- **Exports to Phase 2:** a Windows build that reaches the FS-write paths Phase 2 hardens.
  **Exports to 3–4:** a Windows build that compiles + passes tests on a real runner.

## Acceptance Criteria
- `cargo test -p lyceum-engine` green on macOS (incl. new pure-candidate tests). `cargo test --workspace` still green (no mac regression).
- `cargo check --target x86_64-pc-windows-msvc` compiles clean (type-proof of `cfg(windows)` code).
- New `windows-latest` CI job green: real compile + `cfg(windows)` tests + clippy `-D warnings`.
- `cargo fmt --check` clean.
- ⚑ **Live Windows smoke spec (user, post-build):** install Claude on Windows → app launches → `preflight`
  reports `claudeFound:true` with the resolved path → run **`claude_doctor`** (the existing richer gate:
  9 lyceum skills present, `mcp_servers==[]`, no hooks) → create a subject end-to-end. `claude_doctor`
  passing — not just "create a subject" — is the bar.

## Test tasks
- `windows_candidates_prefers_exe_then_cmd` — fixed env strings → assert order/extensions exactly
  (`.local\bin\claude.exe` before WinGet Links before `%APPDATA%\npm\claude.cmd`). Runs on ANY host.
- `windows_candidates_skips_missing_env` — `None` userprofile drops only those entries, no panic.
- `unix_candidates_unchanged` — asserts the 4 historical paths, in order, for a given HOME.
- (cfg(windows), CI Windows job) `resolve_consults_which_when_dirs_empty` — tolerate `ClaudeNotFound` when
  Claude isn't on the runner (assert it doesn't panic and reaches the `which` branch).
