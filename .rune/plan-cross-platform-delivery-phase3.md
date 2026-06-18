# Phase 3 — One-Line Installers + Ad-hoc macOS Signing

**Goal:** one command installs the app on each OS, pulling the latest GitHub Release asset. Ship the
macOS bundle **ad-hoc-signed** so it launches on Apple Silicon even while unsigned.
**(Hardened 2026-06-18 by a 5-lens red-team — see ⚑ markers.)**

## Research facts this phase encodes
- **Apple Silicon kills an unsigned arm64 app** (kernel AMFI). Ad-hoc signing (Tauri
  `bundle.macOS.signingIdentity = "-"`) is the MINIMUM to launch. Ad-hoc ≠ notarized (no Apple ID needed).
  ⚑ The `APPLE_SIGNING_IDENTITY` env (Phase 4) OVERRIDES this config value, so `"-"` is the safe floor.
- `curl`-downloaded files are NOT quarantined, so an ad-hoc app installed by `install.sh` opens WITHOUT the
  "unidentified developer" prompt; `xattr -dr com.apple.quarantine` is added defensively. macOS 15 removed
  right-click→Open (fallback: System Settings ▸ Privacy ▸ Open Anyway).
- Windows NSIS setup is `currentUser` installMode by default (no admin, `%LOCALAPPDATA%`). Silent flag
  **`/S`** (uppercase). Unsigned ⇒ a one-time SmartScreen "More info → Run anyway" per release build.
- ⚑ Tauri's default `bundle.windows.webviewInstallMode` is `downloadBootstrapper` → the NSIS installer
  auto-installs WebView2 if missing (guards the classic blank-white-window). We keep the default; just verify
  it isn't overridden. No extra task unless we deliberately want offline embedding.
- ⚑ GitHub `releases/latest` returns ONLY a PUBLISHED, non-draft, non-prerelease release. `release.yml`
  currently sets `releaseDraft: true` → BOTH installers AND the updater (Phase 4) 404 until the draft is
  PUBLISHED. → publishing the drafted release is the **go-live step** (or set `releaseDraft:false`).
- ⚑ GitHub Pages project paths are **case-sensitive**: the canonical base is `https://patryk-beep.github.io/Lyceum-App/`. A wrong-case URL 404s and `irm|iex` would then execute the 404 HTML.
- `pages.yml` deploys `path: site` → `site/install.sh` + `site/install.ps1` ship automatically. ✅ verified.

## Data Flow
```
one-liner → fetch script from https://patryk-beep.github.io/Lyceum-App/install.{sh,ps1}
  → GET api.github.com/repos/Patryk-beep/Lyceum-App/releases/latest  (with a User-Agent header — ⚑ required)
  → pick asset by ANCHORED regex (win: -setup\.exe$ ; mac: arch + \.dmg$ — excludes .sig/.app.tar.gz siblings)
  mac: hdiutil attach -nobrowse -noautoopen -quiet -mountrandom → find *.app in the captured mountpoint
       → cp -R to /Applications → hdiutil detach (trap) → xattr -dr com.apple.quarantine → open
  win: Start-Process -Wait <exe> -ArgumentList '/S'   (silent, currentUser, no admin)
```

## Code Contracts (defensive)
```sh
# site/install.sh   (curl -fsSL https://patryk-beep.github.io/Lyceum-App/install.sh | sh)
set -eu
REPO=Patryk-beep/Lyceum-App
case "$(uname -m)" in arm64|aarch64) ARCH='aarch64' ;; *) ARCH='x64' ;; esac
API="https://api.github.com/repos/$REPO/releases/latest"
# ⚑ ALWAYS send a User-Agent or GitHub returns 403; ⚑ capture grep under set -e with ||true then check empty:
json="$(curl -fsSL -H 'User-Agent: lyceum-installer' "$API")"
url="$(printf '%s' "$json" | grep -o "https://[^\" ]*${ARCH}\.dmg" | head -n1 || true)"
[ -n "$url" ] || { echo "Lyceum: no published macOS release found (is the release still a draft?)" >&2; exit 1; }
dmg="$(mktemp -t lyceum).dmg"; curl -fL -H 'User-Agent: lyceum-installer' -o "$dmg" "$url"
mp="$(mktemp -d)"; trap 'hdiutil detach "$mp" >/dev/null 2>&1 || true; rm -f "$dmg"' EXIT
hdiutil attach -nobrowse -noautoopen -quiet -mountpoint "$mp" "$dmg"
app="$(find "$mp" -maxdepth 1 -name '*.app' -print | head -n1)"   # quote for spaces
[ -n "$app" ] || { echo "Lyceum: no .app inside the dmg" >&2; exit 1; }
rm -rf "/Applications/$(basename "$app")"; cp -R "$app" /Applications/
xattr -dr com.apple.quarantine "/Applications/$(basename "$app")" 2>/dev/null || true
echo "Installed. Launch: open -a Lyceum"
```
```powershell
# site/install.ps1   (irm https://patryk-beep.github.io/Lyceum-App/install.ps1 | iex)
$ErrorActionPreference='Stop'; [Net.ServicePointManager]::SecurityProtocol='Tls12'
$repo='Patryk-beep/Lyceum-App'; $ua=@{ 'User-Agent'='lyceum-installer' }      # ⚑ UA header
$rel = irm -Headers $ua "https://api.github.com/repos/$repo/releases/latest"
$asset = $rel.assets | Where-Object { $_.name -match '-setup\.exe$' } | Select-Object -First 1  # ⚑ anchored, excludes .sig
if (-not $asset) { throw 'Lyceum: no published Windows release found (is the release still a draft?)' }
$exe = Join-Path $env:TEMP $asset.name
Invoke-WebRequest -Headers $ua -Uri $asset.browser_download_url -OutFile $exe
Write-Host 'If SmartScreen appears: More info -> Run anyway (unsigned early access).'
Start-Process -Wait -FilePath $exe -ArgumentList '/S'
Write-Host 'Lyceum installed.'
```
- `tauri.conf.json` → under `bundle`: `"macOS": { "minimumSystemVersion": "10.15", "signingIdentity": "-" }`.

## Tasks
1. **`site/install.sh`** — POSIX `sh` per contract; UA header; `||true`+empty-check on grep; `-mountpoint`
   capture + `find` the app; trap-detach + temp cleanup; quarantine strip; friendly errors.
2. **`site/install.ps1`** — per contract; TLS1.2; UA header; anchored `-match`; silent `/S`; SmartScreen note.
3. **`tauri.conf.json`** — set `bundle.macOS.signingIdentity` to `"-"` (ad-hoc). Touch no other key.
4. **`README.md`** — "Install" section with both one-liners VERBATIM (exact `Lyceum-App` case) + a 2-line
   "unsigned early access" note (mac: Open Anyway if needed; win: one-time SmartScreen Run anyway) + a line:
   "updates: re-run the one-liner, or use Settings ▸ Check for updates (Phase 4)".
5. Confirm `release.yml` go-live: a tagged release is DRAFTED — **publish it** (or flip `releaseDraft:false`)
   before the one-liners resolve. Document this in README/QUESTIONS. ⚑

## Failure Scenarios
| When | Then | Handling |
|---|---|---|
| Release still a draft / none published | `releases/latest` 404 or no asset | script prints "no published release (draft?)" + exit 1 |
| GitHub API without UA | 403 | UA header always sent (contract) |
| grep matches nothing under `set -e` | would exit silently | `||true` + explicit empty-check prints a message first |
| Asset regex hits a `.sig`/`.app.tar.gz` | wrong download | anchored `\.dmg$` / `-setup\.exe$` excludes siblings |
| Spaces / multiple `.app` in volume | wrong/failed copy | `-mountpoint` + quoted `find … head -n1` |
| `/Applications` needs sudo | `cp -R` fails | message to re-run elevated; dmg detached by trap |
| Wrong-case Pages URL | 404 HTML piped to `iex`/`sh` | README uses exact case; (optional) script could assert a JSON content-type |

## Rejection Criteria (DO NOT)
- DO NOT use bash-only syntax in `install.sh` (keep POSIX: `uname`, `case`, no `[[`, no `jq`).
- DO NOT hardcode the version in the asset URL — resolve via the releases API (anchored regex).
- DO NOT skip ad-hoc signing — without `signingIdentity:"-"` the arm64 app won't launch.
- DO NOT omit the GitHub `User-Agent` header (hard 403). DO NOT let `grep`/`Where-Object` fail silently.
- DO NOT add Homebrew `--no-quarantine` logic (not our channel; removed in brew 5.0.0).

## Cross-Phase Context
- **Assumes (Phase 1–2):** the installed binary runs + writes correctly on each OS.
- **Exports to Phase 4:** installers use `.dmg`/`-setup.exe` (always built), NOT the updater `.tar.gz`, so
  they're decoupled from the updater toggle. ⚑ Both this phase and Phase 4 depend on the release being
  PUBLISHED (not draft).

## Acceptance Criteria
- `sh -n site/install.sh` clean; `shellcheck site/install.sh` no errors (if available).
- `install.ps1` parses (`pwsh -NoProfile -Command "[ScriptBlock]::Create((gc -Raw site/install.ps1))|Out-Null"` if pwsh present).
- `tauri.conf.json` valid JSON. ⚑ `pnpm bundle:app` proves the **ad-hoc signature** only (`codesign -dv
  /path/Lyceum.app` → `Signature=adhoc`); it builds ONLY `Lyceum.app`, NOT the `.dmg` — so the dmg+install.sh
  end-to-end is verified on a real desktop / CI (full `tauri build`), NOT in this headless shell.
- README one-liners match the hosted URLs exactly (case-correct).

## Test tasks
- Static: `sh -n` on install.sh; JSON-lint `tauri.conf.json` (`python3 -m json.tool`).
- Manual (user/desktop): `pnpm bundle:app` → `codesign -dv` shows `Signature=adhoc`; copied app launches with no Gatekeeper prompt.
- Live (user, after PUBLISHING a release): `irm …/install.ps1 | iex` installs silently; `curl …/install.sh | sh` installs + launches.
