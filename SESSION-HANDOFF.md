# Lyceum-App — Session Handoff

> **START HERE.** Self-contained current state for a fresh, zero-context session. Last updated 2026-06-18.

## What this is
Lyceum-App is an OS-agnostic **Tauri** desktop app (Rust core + React/Vite/TS webview) that is a GUI over the **Lyceum** learning system (the `lyceum` Claude Code plugin of nine skills). It drives the user's local `claude` as a per-subject `claude -p` stream-json child for generation; a deterministic Rust `lyceum-core` crate owns the mechanics; app + Claude share `learning/<slug>/manifest.json` per subject.

## Accomplished this session
- Produced the full implementation plan — **`PLAN.md`** — via a 10-agent workflow; answered all 10 design questions (`PLAN.md` §12).
- **Built & tested M0 (scaffold + deterministic engine)** and **M1 (Claude streaming bridge)**. See "Build progress" below.
- Landing page moved to `/site` + Pages Actions workflow; CI workflows added.
- Running list of autonomous decisions / non-blocking questions kept in **`QUESTIONS-FOR-REVIEW.md`**.

## Build progress (milestone-tested)
- **M0 DONE** — `app/` Tauri+React+Rust workspace. `lyceum-core` pure engine (manifest model, SRS, mastery, routing, ids, store, progress, summary) — 41 tests. `src-tauri` engine-only commands over a headless-testable service — 5 tests. React Night-theme Dashboard rendering the golden subject — vitest. `golden.json` generated from the model + parity test.
- **M1 DONE** — `lyceum-engine` Claude `stream-json` bridge: spawn+env-scrub, tolerant parser, session/turn state machine + `--resume` + watchdog, `BridgeEvent`, plugin staging+validation. React LIVE SESSION drawer/console + Diagnostics screen. **Both acceptance gates pass against the real local Claude** (bridge: stream→result, session_id, resume continuity; skill: 9 lyceum skills via `--plugin-dir`, `mcp_servers==[]`, `apiKeySource==none`, quoted MANIFEST.md verbatim). Live test gated by `LYCEUM_LIVE_CLAUDE=1`; offline parser tests use committed fixtures.
- Spike revised two plan items (see `QUESTIONS-FOR-REVIEW.md` §7–8): **no private `CLAUDE_CONFIG_DIR`** (breaks auth — isolate via `--setting-sources project` + `--strict-mcp-config`); doctor asserts "9 lyceum skills present" not "only lyceum" (bundled Anthropic skills always coexist, inert).
- **NEXT: M2** — one full vertical slice (`create_subject` + `run_step` cycle, per-subject SessionManager, vendored skill machine-output for `quizzes/*.json`, reload-validator, single-writer dev-assert). Then M3 (breadth), M4 (packaging — cross-OS signing needs your CI runners + certs).

## Toolchain (now installed)
- `rustup`/`cargo` 1.96, `claude` v2.1.181, `node` v24 / `pnpm`. `app/.npmrc` sets `verify-deps-before-run=false`; `pnpm.onlyBuiltDependencies` allows esbuild + tauri CLI.
- Verify locally: `cd app && cargo test --workspace && pnpm test && pnpm build`. Full bridge: `LYCEUM_LIVE_CLAUDE=1 cargo test -p lyceum-engine --test live_bridge`.

## Locked decisions (full detail in `PLAN.md` §12)
Raw `claude -p` stream-json subprocess · Tauri v2 · hybrid logic (Rust deterministic / Claude generative) · skills loaded via `--plugin-dir` (NOT `--add-dir`) · `--model claude-opus-4-8` · per-subject isolated session + automatic memory · single global theme (Night) · Claude required (no offline; `preflight()` gates launch) · quota → block + reset banner · backups = ring of 5 timestamped manifests · landing page → `/site` + `pages.yml` · skill machine-output added to the **upstreamable** lyceum skills (not app-only forks).

## Hard constraints
- **Billing:** scrub `ANTHROPIC_API_KEY` + `ANTHROPIC_AUTH_TOKEN` from the spawned child env — otherwise it silently bills per-token instead of drawing from the Max subscription pool.
- **Single-writer-for-mastery:** only Claude's assess/review/capstone turns may write `objective.mastery` / flip a module `mastered` / write `certification`; enforce structurally via a Rust capability token the app code cannot construct.
- Keep files < 500 lines; do exactly what's asked; **no `Co-Authored-By` trailer** (per `~/CLAUDE.md`).
- macOS filesystem is case-insensitive — keep the app at `/Users/patryk/repos/Lyceum-App`, never `/Users/patryk/Lyceum-App` (collides with the plugin folder).

## Next actions (required, in order)
1. **Pre-M1 spike** — probe local `claude` v2.1.181 to confirm `--disallowed-tools`, `--strict-mcp-config`, and empty `--mcp-config`; lock the bridge flags to what's actually supported.
2. **Install the Rust toolchain** (`rustup` / `cargo`).
3. **M0 scaffold** per `PLAN.md` §8 (Tauri + React + `lyceum-core` crate, Night token layer, Dashboard rendering a mock manifest, CI). Then **M1** — de-risk the streaming bridge + headless skill-loading (two hard acceptance gates) before any later milestone.

## Pointers
- Full plan: `PLAN.md`.
- UI design: claude.ai/design project `08c64bc7-1ec4-44b5-93ee-ae2f4ce85d81`, file `Lyceum - Night.dc.html` (DesignSync tool).
- Plugin/skills source to vendor: `/Users/patryk/Lyceum-app/plugins/lyceum/`.
