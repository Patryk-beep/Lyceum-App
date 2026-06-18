# Phase 4 — Updater Fold-in + Signing Hooks (no-op until secrets)

**Goal:** after the one-line install, the app self-updates; and real code-signing is config-only-later
(CI steps that no-op when secrets are absent). Private keys/certs NEVER enter the repo.
**(Hardened 2026-06-18 by a 5-lens red-team — see ⚑ markers; this phase had the most confirmed holes.)**

## Research facts this phase encodes
- ⚑ **`createUpdaterArtifacts: true` REQUIRES `TAURI_SIGNING_PRIVATE_KEY` at build time** — with a pubkey
  configured but no private key, the build FAILS. So hardcoding `true` in the committed `tauri.conf.json`
  would break local `pnpm bundle:app` AND any secretless CI build. → enable it ONLY in the signed release
  pipeline (committed config stays `false`).
- `tauri-action` with `includeUpdaterJson: true` (its default) AUTO-generates + uploads `latest.json` with
  ⚑ ALL built-platform keys (`darwin-aarch64`, `darwin-x86_64`, `linux-x86_64`, `windows-x86_64` per the
  matrix) — do NOT hand-author `latest.json`.
- `latest.json` resolves from `releases/latest/download/latest.json` — ⚑ 404s for a DRAFT release (shared
  dependency with Phase 3: the release must be PUBLISHED).
- Win update installMode `passive` (default) = progress bar, no clicks; app force-exits then the installer
  relaunches it. Distinct from the NSIS **bundle** installMode → ⚑ set `bundle.windows.nsis.installMode:
  "currentUser"` explicitly so a passive update needs no elevation.
- ⚑ The updater plugin is REGISTERED in `lib.rs` but the only capability file is **`default.json`**
  (`permissions:["core:default"]`, no command ACLs) → add `updater:default`. (Custom app commands don't need
  an ACL in Tauri v2 — only plugin commands do, so the existing commands are unaffected.)
- ⚑ `@tauri-apps/plugin-updater` (npm) is NOT yet in `package.json`. Auto-relaunch needs a SEPARATE
  `plugin-process` (Rust + npm + register) — NOT currently present.
- Signing-later: macOS = Apple Dev $99/yr → Developer ID + notarytool + staple. Windows OV certs now need
  HSM/cloud (June-2023 CA/B rule). **Azure Trusted Signing EXCLUDES non-US/Canada individuals** → the user's
  realistic Windows path is an OV cert + cloud signing (e.g. SSL.com eSigner), not Azure. No cert grants
  instant SmartScreen trust (EV bypass removed 2024).

## Data Flow
```
release.yml (tag v* → PUBLISH the draft) → tauri-action: build + (secret-gated) sign + emit updater artifacts
   (createUpdaterArtifacts via a RELEASE-ONLY --config, NOT the committed config) → upload *.sig + latest.json
app: Settings ▸ "Check for updates" → updater.check() → verify .sig vs pubkey → downloadAndInstall()
   → ⚑ show "Update installed — restart Lyceum" (manual restart; NO plugin-process needed for the minimal path)
```

## Code Contracts
```jsonc
// tauri.conf.json — committed values:
"bundle": { …, "createUpdaterArtifacts": false,                 // ⚑ stays false so local builds work
            "windows": { "nsis": { "installMode": "currentUser" } } }
"plugins": { "updater": { "endpoints": [<<unchanged>>], "pubkey": "<<USER PASTES REAL PUBKEY — see Task 6>>",
             "windows": { "installMode": "passive" } } }
```
```json
// src-tauri/capabilities/default.json — add to the permissions array:
"updater:default"
```
```ts
// app/src/lib/updates.ts  (new, thin)
import { check } from '@tauri-apps/plugin-updater';
export async function checkForUpdate(): Promise<{available:boolean; version?:string}>;
//   const u = await check(); return u ? {available:true, version:u.version} : {available:false};
// caller (Settings) on "Install": await u.downloadAndInstall(); then prompt "restart Lyceum".
```
- npm: add `@tauri-apps/plugin-updater` (matches Rust `tauri-plugin-updater = "2"`). ⚑ NO `plugin-process`
  unless auto-relaunch is explicitly wanted (then: add the npm + Rust crate + register in `lib.rs` + capability).

## Tasks
1. **`tauri.conf.json`** — add `plugins.updater.windows.installMode:"passive"` and
   `bundle.windows.nsis.installMode:"currentUser"`. ⚑ Leave `createUpdaterArtifacts` **false** (or absent).
2. **`release.yml`** — enable updater artifacts ONLY here, via a release-only config fragment
   `app/src-tauri/tauri.updater.conf.json` = `{"bundle":{"createUpdaterArtifacts":true}}` passed as
   `--config src-tauri/tauri.updater.conf.json` in the tauri-action `args` (avoids inline-JSON quoting on
   Windows). Keep `includeUpdaterJson` default-on. ⚑ This runs only on the signed pipeline where
   `TAURI_SIGNING_PRIVATE_KEY` exists, so it never breaks a secretless build.
3. **`release.yml`** — ⚑ ACTUALLY add (currently absent) the secret-gated signing wiring, not just prose:
   - macOS step `if: matrix.platform=='macos-latest' && env.APPLE_CERTIFICATE != ''` → import the cert into a
     temp keychain; pass `APPLE_CERTIFICATE/_PASSWORD`, `APPLE_SIGNING_IDENTITY`, `KEYCHAIN_PASSWORD`, and
     `APPLE_API_ISSUER/APPLE_API_KEY/APPLE_API_KEY_PATH` (prefer the .p8 key) to the tauri-action env.
     (`APPLE_SIGNING_IDENTITY` overrides the Phase-3 ad-hoc `"-"`.)
   - Windows: when `WINDOWS_*`/`AZURE_*` secrets exist, set `bundle.windows.signCommand` (trusted-signing-cli
     or relic) — also via the release-only config or env. Absent secrets → step skips → unsigned build.
4. **capability** — add `updater:default` to `default.json`.
5. **`app/src/lib/updates.ts`** + **`Settings.tsx`** button + states ("up to date" / "vX available —
   Install & restart"). Add `@tauri-apps/plugin-updater` to `package.json`. ⚑ Use a manual-restart message,
   NOT auto-relaunch, to avoid pulling in `plugin-process`.
6. **`QUESTIONS-FOR-REVIEW.md` §11–12** — make the **keypair swap a GATING prerequisite** (not the last
   step): before the FIRST updater-artifact release, run `pnpm tauri signer generate`, paste the PUBLIC key
   into `tauri.conf.json`, add `TAURI_SIGNING_PRIVATE_KEY`/`…_PASSWORD` as CI secrets. Until then a `.sig`
   can't verify. Also document the Windows-signing eligibility note (Azure Trusted Signing NOT available to
   non-US/Canada individuals → OV+cloud path).

## Failure Scenarios
| When | Then | Handling |
|---|---|---|
| `createUpdaterArtifacts` hardcoded true, no key | build FAILS | ⚑ avoided — it's false in committed config, enabled only in the keyed release |
| `latest.json` missing / release is a draft | `check()` errors | Settings shows "couldn't check — no published release yet"; never crashes startup |
| pubkey still the throwaway | `.sig` verify fails | ⚑ key swap is a gating prerequisite (Task 6) before the first updater release |
| Signing secrets absent in CI | conditional steps skip | build succeeds UNSIGNED (ad-hoc mac from Phase 3) — not a failure |
| updater capability missing | `check()` throws "not allowed" | Task 4 adds `updater:default` |
| user wants relaunch | manual "restart Lyceum" message | minimal path; auto-relaunch is an explicit opt-in upgrade |

## Rejection Criteria (DO NOT)
- DO NOT commit any private key/cert/password. Pubkey only in config; all else is a CI secret.
- ⚑ DO NOT set `createUpdaterArtifacts:true` in the committed `tauri.conf.json` (breaks keyless builds).
- DO NOT make signing steps unconditional — they MUST skip when the secret is empty.
- DO NOT auto-relaunch via a half-wired `plugin-process` — either wire it fully or use the restart message.
- DO NOT hand-author `latest.json` (tauri-action generates all platform keys). DO NOT list `"updater"` in `bundle.targets`.
- DO NOT switch Win updater to `quiet`. DO NOT block app startup on the update check.

## Cross-Phase Context
- **Assumes (Phase 1–3):** runnable, ad-hoc-signed builds + the installers exist; the release is PUBLISHED.
- **Exports:** self-updating app + signing that flips on with secrets only. Real keypair, Apple Dev, and
  Windows OV/cloud cert are documented user-credential follow-ups, not done here.

## Acceptance Criteria
- `pnpm build` + `pnpm test` green (`updates.ts` typed; a vitest mounts `Settings` and finds the
  "Check for updates" control; `@tauri-apps/plugin-updater` mocked).
- `tauri.conf.json` + `default.json` valid; `cargo test -p lyceum-app` green.
- ⚑ `pnpm bundle:app` STILL succeeds locally with NO signing secrets (proves the no-op path; would fail if
  `createUpdaterArtifacts` were hardcoded true).
- `release.yml` lints (actionlint if available); signing steps are `if:`-guarded; the updater-config fragment
  is referenced via a file path (no inline-JSON quoting).
- `QUESTIONS-FOR-REVIEW.md` documents the gating keypair swap + Windows signing eligibility.

## Test tasks
- `updates.ts` unit: mock `@tauri-apps/plugin-updater` `check` → returns `{available, version}` shape; null → `{available:false}`.
- `Settings.test.tsx`: button present; mocked "up to date" → shows up-to-date state.
- Static: JSON-lint `tauri.conf.json` + `default.json`.
