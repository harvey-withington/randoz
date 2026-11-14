# Builds the Android app from a short folder.
#
# The project path is too long for the C++ part of a React Native build on
# Windows (260-character limit), so this mirrors spikes/spike1 to S:\rz and
# builds there. Edit files here, never in the mirror: it is overwritten.
#
#   pwsh mobile/build-android.ps1            # debug build (needs Metro, see README)
#   pwsh mobile/build-android.ps1 -Release   # release build, JavaScript embedded
#   ... -Release -Arch arm64-v8a             # phones only: smaller and faster to build
#   pwsh mobile/build-android.ps1 -SyncOnly  # just refresh the mirror for Metro

param([switch]$Release, [switch]$SyncOnly, [string]$Mirror = 'S:\rz', [string]$Arch = 'arm64-v8a,x86_64')

# Native tools write warnings to stderr, so failures are judged by exit code.
$ErrorActionPreference = 'Continue'
$spike = Split-Path -Parent $PSScriptRoot

robocopy $spike $Mirror /MIR /XD node_modules android .expo storage received cxx artefacts /XF test-image.bin /NFL /NDL /NJH /NJS /NP | Out-Null
if ($LASTEXITCODE -ge 8) { throw "robocopy failed ($LASTEXITCODE)" }
if ($SyncOnly) { "synced to $Mirror"; exit 0 }

Push-Location $Mirror
try {
  # npm install is quick when nothing changed, and picks up new dependencies.
  npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install failed' }
  Set-Location mobile
  npm install --no-audit --no-fund; if ($LASTEXITCODE) { throw 'npm install failed' }
  if (-not (Test-Path android)) { npx expo prebuild --platform android; if ($LASTEXITCODE) { throw 'prebuild failed' } }
  Set-Location android
  $task = if ($Release) { 'assembleRelease' } else { 'assembleDebug' }
  # Gradle doesn't watch ..\core.js (it is outside the app folder), so always
  # rerun the step that bundles the JavaScript and packs the worklet.
  $bundle = if ($Release) { @(':app:createBundleReleaseJsAndAssets', '--rerun') } else { @() }
  .\gradlew.bat @bundle $task "-PreactNativeArchitectures=$Arch" --console=plain
  if ($LASTEXITCODE) { throw "$task failed" }
  Get-ChildItem app\build\outputs\apk -Recurse -Filter *.apk | ForEach-Object { '{0}  {1:N1} MB' -f $_.FullName, ($_.Length / 1MB) }
} finally { Pop-Location }
