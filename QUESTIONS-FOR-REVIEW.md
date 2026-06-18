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
