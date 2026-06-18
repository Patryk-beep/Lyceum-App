#!/bin/sh
# Lyceum — one-line installer for macOS.
#
#   curl -fsSL https://patryk-beep.github.io/Lyceum-App/install.sh | sh
#
# Downloads the latest signed-or-ad-hoc .dmg from GitHub Releases, installs Lyceum.app
# into /Applications, and strips the quarantine attribute so it launches cleanly.
# No third-party account or package manager required.
set -eu

REPO="Patryk-beep/Lyceum-App"
UA="lyceum-installer"

case "$(uname -m)" in
  arm64|aarch64) ARCH="aarch64" ;;
  *)             ARCH="x64" ;;
esac

echo "Lyceum: finding the latest macOS ($ARCH) release…"
# A User-Agent header is REQUIRED by the GitHub API (a missing one returns 403).
json="$(curl -fsSL -H "User-Agent: $UA" "https://api.github.com/repos/$REPO/releases/latest")"
# Extract the .dmg download URL for this arch. The trailing `$` anchor excludes any
# .dmg.sig / .app.tar.gz siblings. `|| true` keeps `set -e` from exiting without a message.
url="$(printf '%s' "$json" \
  | grep -o '"browser_download_url": *"[^"]*"' \
  | sed 's/.*"\(https[^"]*\)"$/\1/' \
  | grep "${ARCH}\.dmg$" | head -n1 || true)"
if [ -z "$url" ]; then
  echo "Lyceum: no published macOS .dmg found for $ARCH." >&2
  echo "        (Is the latest GitHub release still a draft? Publish it, then retry.)" >&2
  exit 1
fi

work="$(mktemp -d)"
dmg="$work/lyceum.dmg"
mp="$work/mnt"
mkdir -p "$mp"
# Always detach the image and clean up, even on failure.
trap 'hdiutil detach "$mp" >/dev/null 2>&1 || true; rm -rf "$work"' EXIT

echo "Lyceum: downloading $(basename "$url")…"
curl -fL -H "User-Agent: $UA" -o "$dmg" "$url"

echo "Lyceum: installing to /Applications…"
hdiutil attach -nobrowse -noautoopen -quiet -mountpoint "$mp" "$dmg"
app="$(find "$mp" -maxdepth 1 -name '*.app' -print | head -n1)"
if [ -z "$app" ]; then
  echo "Lyceum: no .app found inside the disk image." >&2
  exit 1
fi
base="$(basename "$app")"
rm -rf "/Applications/$base"
cp -R "$app" "/Applications/$base"
# curl-downloaded files aren't quarantined, but strip defensively so first launch is clean.
xattr -dr com.apple.quarantine "/Applications/$base" 2>/dev/null || true

echo "Lyceum: installed. Launch it with:  open -a \"${base%.app}\""
echo "        (Unsigned early access: if macOS blocks it, allow it once via"
echo "         System Settings ▸ Privacy & Security ▸ Open Anyway.)"
