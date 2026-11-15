# Builds the Android app.
#
# The project path is too long for the C++ part of a React Native build on
# Windows (260-character limit), so this mirrors app/ and core/ to a short
# folder and builds there. Edit files in the repo, never in the mirror: it is
# overwritten on every run.
#
#   scripts\build-android.ps1                 # release APK for phones: a dated, numbered build
#   scripts\build-android.ps1 -Emulator       # also includes the emulator's architecture
#   scripts\build-android.ps1 -Debug          # debug build (loads JavaScript from Metro)
#   scripts\build-android.ps1 -SyncOnly       # just refresh the mirror
#
# The mirror is S:\rb unless RANDOZ_BUILD_DIR says otherwise. See docs\BUILDING.md.
#
# A release build for phones is numbered: the number of commits on the branch
# it was built from, so it only ever goes up. It lands in dist\ as
# randoz-<date>-b<number>.apk, the app shows the number under Preferences,
# and Android gets it as the version code. dist\ keeps the six newest numbered
# builds, to roll back to; older ones are deleted. Emulator and debug builds
# have fixed names and are not counted.

param([switch]$Debug, [switch]$Emulator, [switch]$SyncOnly)

# Native tools write warnings to stderr, so failures are judged by exit code.
$ErrorActionPreference = 'Continue'
$repo = Split-Path -Parent $PSScriptRoot
$mirror = if ($env:RANDOZ_BUILD_DIR) { $env:RANDOZ_BUILD_DIR } else { 'S:\rb' }
$env:RANDOZ_CXX_DIR = Join-Path $mirror 'cxx'

foreach ($part in 'app', 'core') {
  robocopy (Join-Path $repo $part) (Join-Path $mirror $part) /MIR /XD node_modules .expo (Join-Path $repo 'app\android') /NFL /NDL /NJH /NJS /NP | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "robocopy failed for $part ($LASTEXITCODE)" }
}
if ($SyncOnly) { "synced to $mirror"; exit 0 }

$numbered = -not $Debug -and -not $Emulator
$build = 0
$date = Get-Date -Format 'yyyy-MM-dd'
if ($numbered) {
  $build = [int](git -C $repo rev-list --count HEAD)
  if ($build -le 0) { throw 'could not work out the build number from git' }
  $env:RANDOZ_BUILD = "$build"
  # The app reads this to say which build it is. Written in the mirror only.
  Set-Content -Path (Join-Path $mirror 'app\src\build.json') -Value ('{ "number": ' + $build + ', "date": "' + $date + '" }') -Encoding ascii
}

function Invoke-Step([string]$what, [scriptblock]$step) {
  & $step
  if ($LASTEXITCODE) { throw "$what failed" }
}

Push-Location $mirror
try {
  # npm install is quick when nothing changed, and picks up new dependencies.
  Set-Location (Join-Path $mirror 'core')
  Invoke-Step 'npm install (core)' { npm install --omit=dev --no-audit --no-fund }
  Set-Location (Join-Path $mirror 'app')
  Invoke-Step 'npm install (app)' { npm install --no-audit --no-fund }
  # Always regenerate the Android project, so app.json and app.config.js changes apply.
  Invoke-Step 'expo prebuild' { npx expo prebuild --platform android --clean --no-install }
  Set-Location android

  $arch = if ($Emulator) { 'arm64-v8a,x86_64' } else { 'arm64-v8a' }
  if ($Debug) {
    Invoke-Step 'assembleDebug' { .\gradlew.bat assembleDebug "-PreactNativeArchitectures=$arch" --console=plain }
    $apk = 'app\build\outputs\apk\debug\app-debug.apk'
  } else {
    # Gradle doesn't watch core\ (it is outside the app folder), so always
    # rerun the step that bundles the JavaScript and packs the worklet.
    Invoke-Step 'assembleRelease' {
      .\gradlew.bat ':app:createBundleReleaseJsAndAssets' --rerun assembleRelease "-PreactNativeArchitectures=$arch" --console=plain
    }
    $apk = 'app\build\outputs\apk\release\app-release.apk'
  }

  $dist = Join-Path $repo 'dist'
  New-Item -ItemType Directory -Force $dist | Out-Null
  $name = if ($Debug) { 'randoz-debug.apk' } elseif ($Emulator) { 'randoz-emulator.apk' } else { "randoz-$date-b$build.apk" }
  Copy-Item $apk (Join-Path $dist $name) -Force
  '{0}  {1:N1} MB' -f (Join-Path $dist $name), ((Get-Item $apk).Length / 1MB)

  if ($numbered) {
    # Keep the six newest numbered builds; delete the rest.
    $old = Get-ChildItem $dist -Filter 'randoz-*-b*.apk' |
      Where-Object { $_.Name -match '^randoz-.*-b\d+\.apk$' } |
      Sort-Object { [int](($_.BaseName -split '-b')[-1]) } -Descending |
      Select-Object -Skip 6
    foreach ($file in $old) {
      Remove-Item $file.FullName -Force
      "deleted old build $($file.Name)"
    }
  }
} finally { Pop-Location }
