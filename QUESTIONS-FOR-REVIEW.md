# Questions & Autonomous Decisions — for Patryk's review

> Non-blocking decisions made while building (per the `/goal` directive to keep
> moving without interruption). None of these block the build; each has a default
> already applied. Review at leisure and tell me to change any.

_Last updated: 2026-06-18 (during M0)._

---

## Decisions taken (with a default already in place)

1. **ts-rs deferred to M2.** The plan calls for `ts-rs` to generate TS types from
   Rust. For M0 I used **hand-authored TS mirrors** (`app/src/lib/types.ts`) plus a
   **fixture parity test** (`golden-parity.test.ts`) that pins the Rust-serialized
   `golden.json` against the TS shape. This is the same drift guard the plan's
   "schema-parity test" asks for, with less ceremony. Switching to ts-rs codegen in
   M2 is straightforward. _Default: hand-authored now, ts-rs in M2._

2. **CSP is `null` for M0.** A tight Content-Security-Policy that also allows Vite's
   dev server + HMR is fiddly; I set `security.csp: null` to keep `tauri dev`
   working and will tighten it in M4 (fonts are already bundled locally, so no CDN
   allowance is needed — the main work is allowing the dev websocket). _Default:
   null now, strict policy in M4._

3. **React 18 (not 19).** Chosen for maximum stability with the current
   `@testing-library/react` + jsdom stack. Easy to bump later. _Default: React 18._

4. **`today()` uses the UTC civil date in M0.** The per-subject "shared today"
   civil-date offset contract (PLAN §5.7) — so the app and Claude agree on due-date
   boundaries — lands in M2 with the bridge. _Default: UTC date until M2._

5. **pnpm build-script approval.** `package.json` pins
   `pnpm.onlyBuiltDependencies: ["esbuild", "@tauri-apps/cli"]` and `app/.npmrc`
   sets `verify-deps-before-run=false` (the pre-run auto-install otherwise fails on
   esbuild's approval prompt). Functionally esbuild resolves its native binary from
   its platform optional-dependency regardless. _Default: allowlisted._

6. **Demo seeding.** A `seed_demo` command writes the bundled `golden.json` sample
   subject (Conversational Spanish) so a fresh install has something to show; the
   Dashboard empty-state offers "Load sample subject". _Default: opt-in button._

---

## Known limitations to verify later (not fixable from this machine)

- **M4 cross-platform packaging cannot be fully verified here.** Signing +
  notarizing macOS, building Windows `.msi`/NSIS and Linux `.AppImage`/`.deb`, and
  the "fresh-VM install" acceptance all require **CI runners on each OS** and
  **your signing credentials** (Apple Developer ID + notarization creds, Windows
  code-signing cert). I'll wire the CI matrix + bundle config and verify the macOS
  build locally; the cross-OS signed-artifact acceptance is an explicit
  needs-your-credentials item.

- **The live GUI window is a manual smoke.** This environment is headless, so I
  verify the Dashboard via component tests (Vitest) + the Rust command/service
  tests + a clean `cargo build`/`vite build`, not by opening the actual window.
  Opening `pnpm tauri dev` on your machine is the final visual confirmation.

---

## Open questions (genuinely want your input eventually — none blocking)

- **A1.** The landing page now lives in `/site` with a Pages **Actions** workflow
  (`.github/workflows/pages.yml`). That workflow only deploys after a push to
  `main` _and_ you enable "GitHub Actions" as the Pages source in repo settings.
  Want me to leave Pages as-is until you flip that switch, or note it for you?

- **A2.** Model pin is `claude-opus-4-8` (locked). For the M1 bridge smoke I'll use
  that. If you'd rather the de-risk spike run on a cheaper model to save the Max
  pool, say so — otherwise I'll keep everything on Opus 4.8 as decided.

---

## M1 spike findings (2026-06-18) — these REVISE the plan's bridge design

I ran the pre-M1 spike against your real `claude` v2.1.181. All required flags
exist. Two findings change the locked plan and are worth your awareness:

7. **No private `CLAUDE_CONFIG_DIR`.** PLAN §4.1 said to spawn the child with a
   private `CLAUDE_CONFIG_DIR` to hide your hooks/MCP. **Empirically that breaks
   auth** — a private config dir returns `Not logged in · Please run /login` (your
   Max OAuth state lives in/with the default config dir, not purely the Keychain).
   **Revised:** use the **default** config dir for auth, and isolate via flags:
   `--setting-sources project` (proven to suppress ALL your global hooks — 0 hook
   events fired) + `--strict-mcp-config` (proven: `mcp_servers == []`). _This is
   the working, isolated config._

8. **"Only-lyceum skills" is unachievable, so the doctor assertion is relaxed.**
   Claude Code ships **bundled skills** (`claude-api`, `deep-research`, `verify`,
   `debug`, `code-review`, `design-sync`, …) that load on every invocation
   regardless of config. They are **inert capabilities** — Claude only runs a skill
   when prompted, so they cannot corrupt a manifest. **Revised doctor gate:** assert
   (a) all 9 `lyceum:*` skills present, (b) `mcp_servers == []`, (c)
   `apiKeySource == "none"` (Max pool, not per-token), (d) no hooks fire — NOT
   "only lyceum". The reload-validator (M2) remains the real corruption guard.

**Both M1 gates passed in the spike:** bridge gate (PONG turn streamed, `result`
ok, `session_id` captured, `--resume` continued the thread) and skill gate (all 9
lyceum skills loaded via `--plugin-dir`; Claude read `references/MANIFEST.md` and
quoted the single-writer rule verbatim — proving genuine `${CLAUDE_PLUGIN_ROOT}`
resolution). Transcripts saved as `app/tests/fixtures/streams/*.jsonl`.
