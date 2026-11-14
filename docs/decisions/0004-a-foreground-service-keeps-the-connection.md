# 0004: A foreground service keeps the connection in the background

## Context

Android freezes an app's process soon after it leaves the screen, and Bare
Kit puts the worklet to sleep at that moment so its connections close
cleanly. A member whose phone is in a pocket is therefore offline: nothing
arrives until they open the app again, and nobody can fetch their photos.

## Decision

While the user is in at least one group and has not turned it off, the app
starts a foreground service as it leaves the screen
(`app/modules/keep-alive`) and does not put the worklet to sleep
(`app/src/lib/background.ts`). Android keeps a process with a foreground
service running. The service does no work: the core runs in the same
process.

- The service must show a notification for as long as it runs. It says that
  RANDOZ is connected, opens the app when tapped, and has one action,
  **Disconnect**, which stops the service; the worklet then sleeps as before.
- It stops when the app returns to the screen.
- Its type is `dataSync`. From Android 15 that type may run six hours in a
  day; when the time runs out Android tells the service, which stops, and
  the worklet sleeps.
- If Android refuses to start the service, the app falls back to sleeping.
- It is a setting on the device (`stayConnected`, on by default).

## Consequences

- Staying connected costs battery and data for as long as the notification
  is there. How much is not yet measured on a real phone.
- A phone that is locked and still for a long time enters Doze, which
  limits the network even for a foreground service. Expect connections to
  drop then and come back when the phone is next used.
- The app overrides how Bare Kit's worklet reacts to the app leaving the
  screen, which depends on `react-native-bare-kit` 0.17.1's `update()`
  method: read `background.ts` before upgrading it.
- `dataSync` is a type Google Play asks apps to justify. That matters when
  the app is published, not while it is installed by hand.
