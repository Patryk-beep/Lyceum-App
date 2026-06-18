# Lyceum-App — Session Handoff

> **START HERE.** Self-contained current state for a fresh, zero-context session. Last updated 2026-06-18.

## What this is
Lyceum-App is an OS-agnostic **Tauri** desktop app (Rust core + React/Vite/TS webview) that is a GUI over the **Lyceum** learning system (the `lyceum` Claude Code plugin of nine skills). It drives the user's local `claude` as a per-subject `claude -p` stream-json child for generation; a deterministic Rust `lyceum-core` crate owns the mechanics; app + Claude share `learning/<slug>/manifest.json` per subject.

## Accomplished this session
- Created the companion repo `Patryk-beep/Lyceum-App` (landing page live at https://patryk-beep.github.io/Lyceum-App/) and cross-linked it with `Patryk-beep/lyceum`.
- Imported the UI design from the claude.ai/design project **"Skill app design system"** (`Lyceum - Night.dc.html`) via the DesignSync connector.
- Produced the full implementation plan — **`PLAN.md`** — via a 10-agent design + red-team + synthesis workflow (11 sections + §12 resolved decisions).
- Answered all 10 open design questions (recorded in `PLAN.md` §12).

## Current state
- Branch `main`. This handoff commit adds `PLAN.md` + this file. Landing page committed earlier (`b472f0b`). **Not pushed** (push only on explicit request).
- **No application code written yet** — `/app` does not exist. The repo holds the landing page (`index.html`), `PLAN.md`, and this handoff.
- `rustup`/`cargo` are **not installed** on this machine (needed for M0).

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
