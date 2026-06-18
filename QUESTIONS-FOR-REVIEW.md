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

---

## M2 notes (2026-06-18)

9. **Skill machine-output is patched in BOTH places.** The `quizzes/<mod>-<ts>.json`
   (teach-lesson, assess-understanding) and `placement-items.json` (placement-test)
   "Machine output" sections were added to the **vendored** plugin
   (`app/src-tauri/resources/lyceum/`, what the app bundles) AND mirrored into the
   **source** plugin (`/Users/patryk/Lyceum-app/plugins/lyceum/`) so they're ready to
   **upstream to `Patryk-beep/lyceum`**. You'll need to commit + push that plugin repo
   yourself to publish them (it isn't a git repo on this machine).

10. **Assess QUIZ-card (`grade_mcq`) deferred to M3.** The mastery gate is already
    visible via the Roadmap (`MasterySeal` node states) and the deterministic Review
    lane (`ReviewCard` + 4 SRS buttons with Rust-computed intervals). Local MCQ
    grading from `quizzes/*.json` (the "generate once, drive many locally" economy)
    rides with M3's lesson/quiz views, once a real teach turn has produced a quiz file.

**M2 gate met:** the full vertical slice replays **deterministically offline** against
a scripted fake-claude — empty `learning/` → curriculum → teach → assign → assess
(m01 mastered, m02 unlocked by the prereq rule) → Leitner review (box1→box2) — with
`validate()` clean at every checkpoint, and the reload-validator HALTs on an
impossible state (`app/crates/lyceum-engine/tests/vertical_slice.rs`).

---

## M4 notes (2026-06-18) — packaging & what needs YOUR credentials

11. **Auto-update: the keypair swap is a GATING prerequisite before the first updater
    release.** `tauri.conf.json` → `plugins.updater.pubkey` holds a throwaway key; the
    matching **private key is NOT in the repo**. `bundle.createUpdaterArtifacts` stays
    `false` in the committed config (so local/keyless builds work); `release.yml`
    **auto-enables** updater artifacts via `src-tauri/tauri.updater.conf.json` ONLY when
    the `TAURI_SIGNING_PRIVATE_KEY` secret is set — otherwise it builds a plain unsigned
    release (no self-update). **Before the first updater release:** run `pnpm tauri signer
    generate`, paste the new **public** key into `tauri.conf.json`, and add the **private**
    key + password as the CI secrets `TAURI_SIGNING_PRIVATE_KEY` /
    `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. Until then, `.sig` files can't verify on clients,
    so do NOT advertise in-app updates.

12. **Cross-platform signing is wired as no-op-until-secrets; here's what enabling it
    actually costs.** `release.yml` now passes the `APPLE_*` / `KEYCHAIN_PASSWORD` /
    `AZURE_*` env through to `tauri-action`; with the secrets empty it SKIPS signing, so
    macOS ships ad-hoc-signed (config `signingIdentity:"-"`) and Windows ships unsigned
    (one-time SmartScreen). To enable real signing later, just add the secrets — no code
    change:
    - **macOS:** Apple Developer Program ($99/yr) → a *Developer ID Application* cert →
      set `APPLE_CERTIFICATE`/`_PASSWORD`/`APPLE_SIGNING_IDENTITY`/`KEYCHAIN_PASSWORD` and
      the App Store Connect API key (`APPLE_API_ISSUER`/`APPLE_API_KEY`/`APPLE_API_KEY_PATH`)
      for notarization. `APPLE_SIGNING_IDENTITY` overrides the ad-hoc `"-"`.
    - **Windows:** ⚠️ **Azure Trusted Signing (~$10/mo) EXCLUDES non-US/Canada individuals**
      — given your jurisdiction the realistic path is an **OV cert + cloud signing** (e.g.
      SSL.com eSigner; OV keys must now live on an HSM/cloud per the June-2023 CA/B rule),
      wired via `bundle.windows.signCommand` (trusted-signing-cli or relic) in a release-only
      `--config`. **No cert gives instant SmartScreen trust** (EV bypass removed 2024) —
      reputation accrues per signed identity, so unsigned-early-access is reasonable for now.
    - The **fresh-VM install + auto-update** acceptance is a manual, per-OS smoke I can't run
      from this one macOS box — the explicit needs-your-machines item.

13. **pnpm 11 quirk.** `pnpm` here ignores the package.json `onlyBuiltDependencies`
    allowlist and its pre-run deps check errors on the (harmless) ignored esbuild
    build script. Fix applied: `verify-deps-before-run=false` (esbuild resolves its
    native binary from its platform optional-dep regardless), set both in the CI
    workflows and globally on this machine. If you see `ERR_PNPM_IGNORED_BUILDS`
    locally, run `pnpm config set verify-deps-before-run false`.

**M4 done here:** theme switching (Night/Almanac/Momentum token sets, Settings
screen), the **preflight blocking gate** (no offline mode — Claude required),
updater plugin + config, bundle config (mac/win/linux targets, macOS min version),
and the release + CI matrix workflows. The Almanac/Momentum palettes are
app-authored approximations — swap with the real DesignSync tokens when convenient.

---

## Build-command verification (2026-06-18) — all green except the headless dmg

I ran every build command end-to-end. Status:

| Command | Result |
|---|---|
| `cargo fmt --all --check` | ✅ pass |
| `cargo clippy --workspace --all-targets -- -D warnings` | ✅ exit 0 |
| `cargo test --workspace` | ✅ 81 passed, 0 failed |
| `cargo run -p lyceum-core --features fixtures --example gen_golden` + drift diff | ✅ fixture in sync |
| `pnpm build` (tsc + vite) | ✅ pass |
| `pnpm test` (vitest) | ✅ 21 passed |
| `pnpm tauri build --bundles app` (→ `Lyceum.app`) | ✅ builds, plugin resource bundled |
| `cargo build --release -p lyceum-app` | ✅ (switched `lto = true` → `"thin"` so the release link is CI-tractable) |
| **`pnpm tauri build` (full, incl. `.dmg`)** | ⚠️ **hangs on the `.dmg` step in a headless shell** |

14. **The full `tauri build` `.dmg` step hangs in a pure headless session.** The
    macOS dmg bundler (`bundle_dmg.sh`) runs an AppleScript/Finder step to set the
    disk-image window layout, which blocks forever when there's no WindowServer
    (this background shell). The `.app` itself builds perfectly. **Workarounds:**
    headless/local → `pnpm bundle:app` (or `tauri build --bundles app`); real
    desktop or **CI macOS runner** (which has a window session) → the full
    `tauri build` with `.dmg` works, which is what `release.yml` uses. Not a code
    defect — a Tauri/macOS headless limitation. (I killed a stuck 2-hour dmg build +
    its orphaned `hdiutil`/mounted volume during this check.)

15. **Windows bridge — IMPLEMENTED (2026-06-18). Live smoke is the only thing left, and
    it's yours.** `spawn::resolve_claude` is now cross-platform: it prefers
    `%USERPROFILE%\.local\bin\claude.exe` (native), then the WinGet Links shim, then
    `%APPDATA%\npm\claude.cmd` (npm-global), with a PATHEXT-aware `which` fallback;
    `canonical()` uses `dunce` to strip the `\\?\` prefix; the two atomic-rename write
    paths + the derived `progress.md` write are hardened against transient Windows file
    locks. Proven offline by a real **`windows-latest` CI job** (compiles the `cfg(windows)`
    path + runs its tests) and `cargo check --target x86_64-pc-windows-msvc` locally; pure
    candidate-generator unit tests run on every host. **Final confirmation needs a Windows
    box with Claude Code logged in:** launch → `preflight` shows `claudeFound:true` →
    `claude_doctor` passes (9 lyceum skills, `mcp_servers==[]`, no hooks) → create a subject.

16. **One-line installers + the publish-the-draft go-live step.** New `site/install.sh`
    (`curl -fsSL … | sh`, macOS) and `site/install.ps1` (`irm … | iex`, Windows) pull the
    latest asset from GitHub Releases and install it (mac: dmg → /Applications + quarantine
    strip; win: NSIS `/S` silent, per-user, no admin). They're served by the existing Pages
    workflow. **Both — and the updater's `latest.json` — require a PUBLISHED release:**
    `release.yml` sets `releaseDraft: true`, and `releases/latest` 404s for a draft. So the
    **go-live action is: tag `v*` → wait for the draft build → PUBLISH the release.** (Flip
    `releaseDraft:false` if you'd rather auto-publish on tag.) Unsigned-early-access UX:
    macOS Open-Anyway fallback; Windows one-time SmartScreen — both documented in the README
    and echoed by the scripts.
