# Phase 2 — Windows Filesystem Hardening

**Goal:** the two atomic-rename write paths survive transient Windows file locks (antivirus / Search
indexer / backup tools briefly holding a handle), so manifest saves and plugin staging don't fail
intermittently. Cross-platform code (no `cfg`), no behavior change on macOS/Linux.

## Research facts this phase encodes
- On Windows `std::fs::rename` = `MoveFileExW(REPLACE_EXISTING|WRITE_THROUGH)`. It overwrites an existing
  file, BUT fails with `ERROR_SHARING_VIOLATION` (os error 32) / `ERROR_ACCESS_DENIED` (5) if ANY process
  holds the source or destination open without share-delete — common with AV/indexer scanning a just-written
  `manifest.json` or freshly-copied `SKILL.md` files. The Claude child ALSO reads `manifest.json`.
- A short bounded retry with small backoff is the standard mitigation (the lock is transient, ~ms).
- Directory `fsync` via `File::open(dir).sync_all()` already fails gracefully on Windows (std can't open a
  dir without `FILE_FLAG_BACKUP_SEMANTICS`) — the existing `if let Ok(dirf)` guard handles it. Leave as-is.

## Data Flow
```
manifest write:  save() [store.rs]  → write .tmp → fsync → fs::rename(.tmp, manifest.json)   ← wrap in retry
plugin staging:  stage_plugin() [workspace.rs] → copy tree → remove_dir_all(staged) → fs::rename(.staging, staged)  ← wrap rename in retry
progress write:  orchestrate.rs:~114  → std::fs::write(learning/<slug>/progress.md, rendered)  ← ⚑ THIRD path (red-team)
```
⚑ `progress.md` is a NON-atomic `fs::write` (truncate+write, no rename) of a DERIVED file. Under a transient
AV/indexer lock it can also fail — but it is regenerated every turn, so a failure must NOT abort the turn.

## Code Contracts
```rust
// A tiny shared helper (define ONCE; simplest home: lyceum-core/src/store.rs, re-exported, OR duplicate the
// 6-line fn in each crate to avoid a new cross-crate API — pick duplication if a pub API would leak).
fn rename_with_retry(from: &Path, to: &Path) -> std::io::Result<()>;
//   loop up to N=10 times: match fs::rename(from,to) { Ok=>return Ok, Err if transient_lock(&e) && tries left
//       => sleep(backoff), continue, Err=>return Err }
//   backoff: 10ms, 20ms, 40ms … capped ~250ms (total < ~1s worst case). Use std::thread::sleep (these are
//       sync fns on a blocking path — NOT async).
fn transient_lock(e: &std::io::Error) -> bool;  // raw_os_error() == Some(32) || Some(5)  (Windows); always false on unix-only errors
```
- `store.rs::save`: replace `fs::rename(&tmp, path)` (line ~74) with `rename_with_retry(&tmp, path)`,
  keeping the existing `remove_file(&tmp)` cleanup-on-final-Err.
- `workspace.rs::stage_plugin`: replace `std::fs::rename(&tmp, &staged)` (line ~61) with the retry helper.
- On non-Windows, `transient_lock` returns false at the first error → behaves EXACTLY like today (no retry,
  same error) → zero macOS/Linux behavior change.

## Tasks
1. **`store.rs`** — add `rename_with_retry` + `transient_lock` (private). Swap the save() rename. Keep the
   `.tmp` cleanup on the terminal error path intact.
2. **`workspace.rs`** — add the same retry (duplicate the 6-liner; document "kept local to avoid a public
   cross-crate fs API"). Swap the staging rename.
3. **`orchestrate.rs` (~line 114)** — ⚑ make the `progress.md` write resilient AND non-fatal: retry the
   `fs::write` on a transient lock (reuse the same `transient_lock` classification), and if it STILL fails,
   `log`/swallow and continue the turn (do NOT propagate with `?`). Rationale: `progress.md` is derived from
   the manifest and re-rendered next turn; a missing/stale render must never fail an otherwise-valid turn.
   (Keep the manifest reload+validate, which IS load-bearing, propagating as today.)
4. Confirm no new `cfg`/platform deps; `raw_os_error` codes are compared as plain integers (compile on all OSes).

## Failure Scenarios
| When | Then | Error/handling |
|---|---|---|
| AV holds `manifest.json` for ~20ms during save | retry succeeds within budget | save() returns Ok; no user-visible error |
| Lock persists > ~1s (genuine contention) | retries exhaust → return the last `Err` | save() surfaces the IO error as today; `.tmp` removed |
| Non-lock error (ENOSPC, EACCES on dir) | `transient_lock` false → return immediately | identical to current behavior |
| macOS/Linux any error | no retry, immediate return | byte-for-byte current behavior |

## Rejection Criteria (DO NOT)
- DO NOT make the retry async or add tokio — these are sync `fs` paths on blocking call sites.
- DO NOT widen `transient_lock` to retry on ALL errors (would hang on ENOSPC/permission bugs).
- DO NOT add a `cfg(windows)` gate around the helper — keep it cross-platform; the os-error check is the gate.
- DO NOT change `save`'s signature, the backup-ring logic, fsync, or `tmp_path`.
- DO NOT introduce a new public cross-crate dependency just to share 6 lines.
- ⚑ DO NOT make the `progress.md` failure fatal (it's derived) — but DO keep the manifest reload/validate fatal.

## Cross-Phase Context
- **Assumes (Phase 1):** the app actually reaches these write paths on Windows (resolver fixed).
- **Exports:** durable writes under Windows AV/indexer pressure — needed for the "thoroughly tested,
  fully functional" bar during the live Windows smoke (create subject → save manifest under Defender).

## Acceptance Criteria
- `cargo test -p lyceum-core -p lyceum-engine` green on macOS AND on the Phase 1 Windows CI job.
- `cargo clippy --workspace --all-targets -- -D warnings` + `cargo fmt --check` clean.
- The existing store/workspace tests pass unchanged (retry is transparent on the happy path).

## Test tasks
- `transient_lock_classifies_os_errors` — construct `io::Error::from_raw_os_error(32)` / `(5)` → true;
  `(28)` (ENOSPC) → false. Runs on any host (pure integer check).
- `rename_with_retry_succeeds_immediately` — normal rename of a temp file → Ok on first try (no sleep path).
- `rename_with_retry_returns_err_for_missing_source` — renaming a non-existent file exhausts/returns Err
  promptly (missing-source is not classified transient on unix → immediate).
- Existing `store.rs` save round-trip + backup-ring tests remain green (regression guard).
- ⚑ `orchestrate` slice test (fake-claude) stays green AND a turn still succeeds when the `progress.md`
  target dir is briefly unwritable (best-effort write does not abort the turn).
