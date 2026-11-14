# Building RANDOZ

RANDOZ is two packages:

| Folder | What |
|---|---|
| `core/` | The peer-to-peer core: groups, invites, encrypted items. Plain JavaScript, type-checked through JSDoc. Runs on Node (tests, tools) and on Bare (the phone). |
| `app/` | The Android app: React Native (Expo) in TypeScript. The core runs inside it in a Bare worklet, `app/worklet/worker.js`. |

`spikes/spike1/` is the experiment that proved the stack; it is not part of
the app.

## Everyday commands

From the repo root:

```powershell
npm run check            # type checks, core and app
npm test                 # unit and end-to-end tests of the core, string tests of the app
npm run build            # signed release APK for phones -> dist\randoz.apk
npm run build:emulator   # the same plus the emulator's architecture -> dist\randoz-emulator.apk
```

First time: `npm install` in `core/` and in `app/`.

## What you need (Windows)

- Node 24.
- Microsoft OpenJDK 17, with `JAVA_HOME` set.
- The Android SDK (command-line tools, platform 36, build tools 36), with
  `ANDROID_HOME` set and `platform-tools` on `PATH`.

The C++ toolchain (NDK, CMake) is downloaded by the first build.

Two more things, once per machine, because of Windows' 260-character path
limit (the next section has the why):

- **Long-path support on.** In an administrator PowerShell:
  `reg add HKLM\SYSTEM\CurrentControlSet\Control\FileSystem /v LongPathsEnabled /t REG_DWORD /d 1 /f`
- **A `ninja` that supports long paths.** The one in the Android SDK's
  CMake (1.10.2) does not. After the first build has downloaded CMake,
  replace `%ANDROID_HOME%\cmake\3.22.1\bin\ninja.exe` with version 1.13 or
  later from <https://github.com/ninja-build/ninja/releases>, keeping the
  old file beside it.

Without both, the build stops in the C++ step with
`ninja: error: mkdir(...): No such file or directory`.

## Why the build runs in another folder

A React Native build writes C++ output whose paths repeat the project path,
and they pass Windows' 260-character limit. Two measures keep it working:
long-path support (above), and a short build folder.
`scripts\build-android.ps1` mirrors `app\` and `core\` to a short folder
(`S:\rb`, or `RANDOZ_BUILD_DIR`) and builds there. Edit files in the repo,
never in the mirror: it is overwritten on every build.

With long paths on, building straight from the repo may work and the mirror
may be unnecessary. That has not been tried.

Two things follow from the core living outside `app\`:

- Gradle does not notice when `core\` changes, so the script always reruns
  the step that bundles the JavaScript and packs the worklet.
- The script regenerates the Android project (`expo prebuild --clean`) every
  time, so `app.json` and `app.config.js` are the only places to configure it.

## Signing

Every build people install must be signed with the same key, or Android
refuses to install it over the previous one.

The key is not in this repository. It lives in the builder's user folder:

```
%USERPROFILE%\.randoz\randoz-release.jks      the key
%USERPROFILE%\.randoz\signing.properties      where it is, and its password
```

`app.config.js` reads `signing.properties` and signs release builds with it.
Without the file, release builds are signed with a debug key, which is fine
for trying things and useless for updates.

**Back that folder up.** If the key is lost, nobody can update the app they
have: they must uninstall it, and their groups go with it.

`signing.properties` has four lines:

```
storeFile=C:\Users\you\.randoz\randoz-release.jks
storePassword=...
keyAlias=randoz
keyPassword=...
```

## Running on the emulator

```powershell
npm run build:emulator
adb install -r dist\randoz-emulator.apk
```

The emulator sits on a private network, so it cannot hold a connection to a
peer on the same PC (see `spikes/spike1/README.md`). It is good for the
screens and for one device's flows; two-device tests need real devices.

## Running on a phone

```powershell
npm run build
adb install -r dist\randoz.apk      # or copy the file to the phone and open it
```
