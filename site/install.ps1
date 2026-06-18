# Lyceum — one-line installer for Windows.
#
#   irm https://patryk-beep.github.io/Lyceum-App/install.ps1 | iex
#
# Downloads the latest NSIS setup from GitHub Releases and runs it silently (/S),
# per-user (no admin). No third-party account or package manager required.
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$repo = 'Patryk-beep/Lyceum-App'
# A User-Agent header is REQUIRED by the GitHub API (a missing one returns 403).
$ua = @{ 'User-Agent' = 'lyceum-installer' }

Write-Host 'Lyceum: finding the latest Windows release...'
$rel = Invoke-RestMethod -Headers $ua -Uri "https://api.github.com/repos/$repo/releases/latest"
# Anchored match excludes the *-setup.exe.sig updater sibling.
$asset = $rel.assets | Where-Object { $_.name -match '-setup\.exe$' } | Select-Object -First 1
if (-not $asset) {
  throw 'Lyceum: no published Windows -setup.exe found. (Is the latest release still a draft? Publish it, then retry.)'
}

$exe = Join-Path $env:TEMP $asset.name
Write-Host "Lyceum: downloading $($asset.name)..."
Invoke-WebRequest -Headers $ua -Uri $asset.browser_download_url -OutFile $exe

Write-Host 'Lyceum: if Microsoft Defender SmartScreen appears, choose "More info" -> "Run anyway" (unsigned early access).'
Write-Host 'Lyceum: installing (silent)...'
Start-Process -Wait -FilePath $exe -ArgumentList '/S'
Write-Host 'Lyceum: installed. Launch it from the Start menu.'
