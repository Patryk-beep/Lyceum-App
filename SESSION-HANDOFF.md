# Lyceum-App — Session Handoff

> **START HERE.** Self-contained current state for a fresh, zero-context session. Last updated 2026-06-18.

## Current state (one line)
M0–M4 + the **Aurelia Dark** default theme + an "Aurelia visual fidelity" pass are **built, tested, and pushed** to GitHub `Patryk-beep/Lyceum-App` `main` (commit `a17a133`, in sync). Clean tree. **Not yet functional on Windows** (one bounded bridge gap — see Next actions).

## What this is
Lyceum-App is an OS-agnostic **Tauri** desktop app (Rust core + React/Vite/TS webview) that is a GUI over the **Lyceum** learning system (the `lyceum` Claude Code plugin of nine skills). It drives the user's local `claude` as a per-subject `claude -p` stream-json child for generation; a deterministic Rust `lyceum-core` crate owns the mechanics; app + Claude share `learning/<slug>/manifest.json` per subject.

## Accomplished
- Full plan (`PLAN.md`, 10-agent workflow) → built **M0–M4** milestone-by-milestone, each tested before advancing.
- Imported the **Aurelia Dark** design (DesignSync) → now the default theme; added 3 more theme token sets.
- "Aurelia visual fidelity" feature: hardened by **2 adversarial series** (64 findings → 10 confirmed, folded into `.rune/plan-aurelia-fidelity*.md`) then implemented — sigil, medallion seals, opt-in gilt dial, cross-subject study streak, gilded Dashboard cover.
- Landing page in `/site` (+ `pages.yml`); CI in `.github/workflows/`. Autonomous decisions/caveats in **`QUESTIONS-FOR-REVIEW.md`**.

## Build progress (milestone-tested) — M0–M4 + Aurelia all built, tested, pushed
- **M0 DONE** — `app/` Tauri+React+Rust workspace. `lyceum-core` pure engine (manifest model, SRS, mastery, routing, ids, store, progress, summary). `src-tauri` engine-only commands over a headless-testable service. React Night-theme Dashboard from the golden subject. `golden.json` generated from the model + parity test.
- **M1 DONE** — `lyceum-engine` Claude `stream-json` bridge: spawn+env-scrub, tolerant parser, session/turn state machine + `--resume` + watchdog, `BridgeEvent`, plugin staging+validation. LIVE SESSION drawer/console + Diagnostics. **Both gates pass vs real Claude** (bridge + skill); live tests gated by `LYCEUM_LIVE_CLAUDE=1`.
- **M2 DONE** — `run_step` orchestrator + reload-validator + per-subject SessionManager + `create_subject`/`run_subject_step` + deterministic review lane. **Acceptance: the full vertical slice replays deterministically offline** (fake-claude) AND a live orchestrator turn (real Claude Write→reload→validate). Skill machine-output (quizzes/placement-items) patched + mirrored to the source plugin for upstreaming.
- **M3 DONE** — analytics (reconciled with fixture) + heatmap, deterministic placement adaptive loop + screen, Capstone, Research/Lesson markdown views, multi-subject dashboard routing, onboarding wizard.
- **M4 DONE (here)** — theme switching (Night/Almanac/Momentum + Settings), **preflight blocking gate** (Claude required, no offline), updater plugin+config, bundle config (mac/win/linux), release + CI matrix workflows. Cross-OS **signed** installers + auto-update + fresh-VM smoke need YOUR runners/certs/keypair — see `QUESTIONS-FOR-REVIEW.md` §11–13.
- **Aurelia theme + visual fidelity DONE** — `tokens.aurelia-dark.css` (deep-indigo glass, EB Garamond + Jost fonts bundled) as default; `Sigil`, `SectionDivider`, medallion `MasterySeal`, opt-in gilt-dial `MasteryRing`, `lyceum-core::streak` + `study_streak` cmd + `StreakCard`, gilded Dashboard cover. **Token-driven** (all 4 themes benefit); a grep-for-hex gate forbids literal hex in new CSS.
- Spike revised two plan items (`QUESTIONS-FOR-REVIEW.md` §7–8): **no private `CLAUDE_CONFIG_DIR`** (breaks auth — isolate via `--setting-sources project` + `--strict-mcp-config`); doctor asserts "9 lyceum skills present" not "only lyceum".

## Test counts (last green run)
~88 Rust tests (`cargo test --workspace`) + 28 frontend (`pnpm test`) + live bridge/orchestrate (`LYCEUM_LIVE_CLAUDE=1`). clippy `-D warnings` + fmt + tsc + vite build all clean.

## NOT functional on Windows yet (one bounded gap)
`lyceum-engine::spawn::resolve_claude` is Unix-only (`$HOME`, `/opt/homebrew`, bare `claude`) → preflight blocks launch on Windows. The UI (WebView2) and store (Rust `fs::rename` = MoveFileExW-replace) are Windows-safe. Fix lives in `spawn.rs`: `%USERPROFILE%`/`%LOCALAPPDATA%`, `claude.exe`/`.cmd`, `.cmd`-spawn handling, strip the `\\?\` `canonicalize` prefix (dunce crate). `CREATE_NO_WINDOW` is already handled.

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
