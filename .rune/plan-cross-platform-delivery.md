# Plan — Cross-Platform Delivery (Windows bridge + one-line installers + updater)

> Make Lyceum **functional on Windows** and give both OSes a **one-line installer**.
> Master overview only — execute each phase from its own `-phaseN.md` file.
> Status legend: ⬚ Pending · ◐ In progress · ✅ Done

## Goal
1. The Claude bridge runs on Windows (today it can't — `resolve_claude` is Unix-only).
2. `curl … | sh` (macOS) and `irm … | iex` (Windows) install the app in one command.
3. Post-install, the app self-updates (Tauri updater finished + signed `latest.json`).
4. Zero regression on macOS; signing wired as **no-op-until-secrets** (ship unsigned now).

## Phases
| # | Title | Done when | Status |
|---|-------|-----------|--------|
| 1 | Windows bridge core | `claude.exe`/`.cmd` resolved + spawned correctly; `\\?\` paths simplified; `cargo check --target x86_64-pc-windows-msvc` clean; pure candidate tests pass on mac; Windows CI job green | ⬚ |
| 2 | Windows FS hardening | manifest save + plugin staging survive transient AV/indexer file locks (bounded rename-retry); cross-platform tests | ⬚ |
| 3 | One-line installers + ad-hoc mac sign | `install.sh` + `install.ps1` on Pages; macOS bundle ad-hoc-signed (launches on Apple Silicon); README one-liners + Gatekeeper/SmartScreen notes | ⬚ |
| 4 | Updater fold-in + signing hooks | `createUpdaterArtifacts` on; `latest.json` per release; in-app "check for updates" (Settings); real-keypair swap documented; secret-driven mac+win signing that no-ops absent secrets | ⬚ |

## Key Decisions (locked with the user 2026-06-18)
- **Win one-liner:** self-hosted `install.ps1` → `irm … | iex` (no third-party account/moderation).
- **mac one-liner:** self-hosted `install.sh` → `curl -fsSL … | sh` (strips quarantine; assets aren't quarantined when curl-downloaded).
- **Signing:** PHASED — unsigned now, CI signing steps no-op until `APPLE_*`/`WINDOWS_*` secrets exist.
- **Updater:** folded in; private key stays OUT of repo (CI secret); throwaway pubkey replaced once by the user.

## Decision Compliance (existing locks in PLAN.md / QUESTIONS-FOR-REVIEW.md)
- Env-scrub (`ANTHROPIC_API_KEY`/`AUTH_TOKEN`) unchanged. Isolation flags unchanged.
- No private `CLAUDE_CONFIG_DIR`. Single-writer-for-mastery untouched. Files < 500 lines. No `Co-Authored-By`.

## Architecture
- **Bridge (Phase 1–2):** `lyceum-engine/src/spawn.rs` resolver becomes cross-platform via a **pure
  candidate-generator** (`fn *_candidates(env…) -> Vec<PathBuf>`, host-agnostic, unit-tested on mac)
  + thin IO probe; `which` crate (honors PATHEXT) as PATH fallback; `dunce::canonicalize` everywhere
  `std::fs::canonicalize` was used. `lyceum-core/src/store.rs` + `lyceum-engine/src/workspace.rs`
  gain a bounded retry around `fs::rename` (Windows sharing-violation).
- **Delivery (Phase 3–4):** new `site/install.sh` + `site/install.ps1` (served by existing `pages.yml`),
  pull the latest asset from GitHub Releases. `tauri.conf.json` ad-hoc sign + `createUpdaterArtifacts`.
  `release.yml` gains no-op-able signing env; `app-ci.yml` gains a Windows compile+test job.

## Dependencies / Risks (red-team-hardened 2026-06-18 — 5 lenses, confirmed findings folded into phases)
- New crates: `which = "7"`, `dunce = "1"` (engine). `app/rust-toolchain.toml` **already exists**
  (`channel="stable"`, ≫1.77.2) → EDIT to add `targets=["x86_64-pc-windows-msvc"]`; do NOT recreate it.
- **Go-live dependency:** `release.yml` drafts releases (`releaseDraft:true`). `releases/latest` (installers)
  and `releases/latest/download/latest.json` (updater) 404 for a draft → **publish the release** to go live.
- **`createUpdaterArtifacts` stays `false` in committed config** (it requires the signing key at build time);
  enabled only in the keyed release pipeline so local/secretless builds never break.
- **Cannot run the live Windows GUI here** — offline proof = real `windows-latest` CI (compile +
  `cfg(windows)` tests + clippy) + `cargo check --target …-msvc` locally. Live Windows smoke = install Claude
  → `claude_doctor` passes → create a subject (user's final confirmation).
- **User-credential follow-ups** (not blocking): real updater keypair (gating before the first updater
  release); Apple Dev ID; Windows OV+cloud cert. Azure Trusted Signing is **NOT** available to non-US/Canada
  individuals — documented in Phase 4.

## Outcome Block
- **Planned:** 4 dependency-ordered phases taking the app from macOS-only to cross-platform + one-line installable + self-updating.
- **Immediate next action:** Execute Phase 1 (`plan-cross-platform-delivery-phase1.md`).
- **How to measure:**
  | Check | Command |
  |---|---|
  | Win compiles | `cd app && rustup target add x86_64-pc-windows-msvc && cargo check --target x86_64-pc-windows-msvc` |
  | No mac regression | `cd app && cargo test --workspace && pnpm test && pnpm build` |
  | Installers exist | `test -f site/install.sh && test -f site/install.ps1` |
