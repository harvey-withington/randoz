---
name: run-app
description: Run RANDOZ in the Android emulator, or its landing page in headless Edge, and screenshot it to see a UI change rendered. Use when asked to run, preview or screenshot the app or website, or to confirm a UI change works for real.
---

# Run and screenshot RANDOZ

The app runs in the Android emulator; the landing page in headless Edge.
Either way a visual check ends the same: Read the PNG and actually look at it.

## The app

The app is Android only and has no browser build: it is seen in the Android
emulator, driven with `adb`. A visual check means: build for the emulator,
install, tap to the screen, take a screenshot, then Read the PNG and look.

```bash
npm run build:emulator        # several minutes: run it in the background -> dist/randoz-emulator.apk
```

```bash
SDK="$LOCALAPPDATA/Android/Sdk"; ADB="$SDK/platform-tools/adb.exe"
export MSYS_NO_PATHCONV=1     # or Git Bash rewrites /sdcard/... into a Windows path
a() { "$ADB" -s emulator-5554 "$@"; }

# Start it (a cold boot; minimised so it does not take the screen), then wake it.
powershell -Command "Start-Process '$SDK/emulator/emulator.exe' -ArgumentList '-avd','randoz','-no-snapshot','-no-boot-anim','-no-audio' -WindowStyle Minimized"
"$ADB" wait-for-device
until a shell getprop sys.boot_completed | grep -q 1; do sleep 3; done
a shell input keyevent 224; a shell input keyevent 82; a shell svc power stayon true

a install -r dist/randoz-emulator.apk
a shell monkey -p com.goodegg.randoz -c android.intent.category.LAUNCHER 1
sleep 12                                              # the core takes a moment to start

a exec-out screencap -p > "$S/screen.png"             # then Read it
a shell uiautomator dump /sdcard/ui.xml >/dev/null    # what is on screen, and where:
a shell cat /sdcard/ui.xml | grep -o '\(text\|content-desc\)="[^"]\+"[^>]*bounds="[^"]*"'
a shell input tap 540 1200                            # x y, in the screenshot's own pixels

a emu kill                                            # when done; delete dist/randoz-emulator.apk
```

Gotchas:

- Launch the app only once the screen is awake. Launched on a dark screen
  it gets no focused window, Android reports it as not responding, and
  every screenshot is black while `uiautomator` still describes the app.
  If that happens: `a shell am force-stop com.goodegg.randoz`, wake the
  screen, launch again. If screenshots stay black, restart the emulator.
- Find a button's position from the `uiautomator` dump, not by eye: tap the
  middle of its `bounds`. `input keyevent 4` is Back, which closes a sheet
  or the viewer as well as the keyboard.
- A drag needs a held press: `input motionevent DOWN x y`, a few
  `MOVE x y` with short sleeps, then `UP x y`. `input swipe` is too quick
  for the drag handles but fine for a swipe gesture.
- For a tablet's layout: `a shell wm size 2560x1600; a shell wm density 320`,
  relaunch, and `wm size reset; wm density reset` after. For landscape:
  `settings put system accelerometer_rotation 0` then
  `settings put system user_rotation 1`.
- The emulator cannot connect to another member, on this PC or anywhere
  else. Anything that needs two members (a shared photo arriving, who is
  online, blocking) cannot be seen here: test it in `core/test`, and say
  the screen was not seen.
- The emulator keeps its groups and photos between runs, which is useful:
  there is a group with photos to look at.
- Never run `adb` against a real phone without asking the owner first.
  `-s emulator-5554` on every command keeps it to the emulator.

## The website

```bash
node scripts/serve-website.mjs 5181     # background; 5180 may be the user's own
for i in $(seq 1 30); do curl -sf http://localhost:5181/ >/dev/null && break; sleep 1; done
```

## Screenshot the website with headless Edge

```bash
S="$SCRATCHPAD"    # any writable dir; use the session scratchpad
"/c/Program Files (x86)/Microsoft/Edge/Application/msedge.exe" \
  --headless=new --disable-gpu --no-first-run --no-default-browser-check \
  --user-data-dir="$S\\edge-profile-$RANDOM" \
  --window-size=1440,900 --hide-scrollbars --virtual-time-budget=5000 \
  --screenshot="$S\\page.png" \
  "http://localhost:5181/"
```

Gotchas:

- Pass Windows-style paths (`C:\...`) to `--screenshot` and `--user-data-dir`;
  a `/c/...` path exits 0 and writes nothing.
- Use a fresh `--user-data-dir` every run. A lingering headless instance on a
  reused profile absorbs the launch: exit 0, no file.
- `--virtual-time-budget` lets fonts, fetches and sockets settle first.
- The capture follows the system theme; tokens must cover light and dark.
- Headless Edge will not go narrower than about 500 CSS px. For a phone
  layout, screenshot a wrapper page holding a 390px-wide iframe.

## Stop what you started

Kill by port, and only your own ports:

```bash
pid=$(netstat -ano | grep LISTENING | grep ":5181 " | awk '{print $NF}' | head -1)
[ -n "$pid" ] && taskkill //PID $pid //T //F
```
