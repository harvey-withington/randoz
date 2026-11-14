// Staying connected while the app is off the screen.
//
// Bare Kit puts the worklet to sleep whenever the app leaves the screen, and
// wakes it when it comes back: Android would freeze the process anyway. To
// stay connected, the app starts a foreground service (modules/keep-alive)
// as it leaves, which keeps the process running, and skips the sleep. The
// service shows a notification for as long as it runs; its one action stops
// it, and then the worklet sleeps as it would have.

import { AppState, PermissionsAndroid, Platform, type AppStateStatus } from 'react-native';
import { Worklet } from 'react-native-bare-kit';
import KeepAlive from '../../modules/keep-alive';

interface SleepyWorklet {
  update(state?: AppStateStatus): void;
  suspend(): void;
  resume(): void;
}

export interface KeepConnectedOptions {
  /** Asked each time the app leaves the screen. */
  wanted(): boolean;
  /** The notification's words, in the user's language. */
  words(): { title: string; text: string; stop: string };
}

/**
 * Takes over when the running worklets sleep and wake. Call it once the
 * core has started. Returns a function that hands control back.
 */
export function keepConnected({ wanted, words }: KeepConnectedOptions): () => void {
  const worklets = [...(Worklet as unknown as { _worklets: Set<SleepyWorklet> })._worklets];
  let held = false; // off the screen, kept awake by the service

  const sleep = () => {
    for (const worklet of worklets) {
      try {
        worklet.suspend();
      } catch {
        // A worklet that has stopped has nothing to put to sleep.
      }
    }
  };

  for (const worklet of worklets) {
    worklet.update = (state = AppState.currentState) => {
      if (state === 'active') {
        held = false;
        KeepAlive.stop();
        try {
          worklet.resume();
        } catch {
          // Stopped already.
        }
      } else if (state === 'background') {
        if (wanted()) {
          try {
            const { title, text, stop } = words();
            KeepAlive.start(title, text, stop);
            held = true;
            return;
          } catch {
            // Android refused the service: sleep, as without it.
          }
        }
        sleep();
      }
    };
  }

  const heard = KeepAlive.addListener('onStopped', () => {
    if (!held) return;
    held = false;
    sleep();
  });

  return () => {
    heard.remove();
    KeepAlive.stop();
    for (const worklet of worklets) delete (worklet as Partial<SleepyWorklet>).update;
  };
}

/**
 * Asks once to show notifications (Android 13 and later). The service runs
 * without it; the user just would not see that RANDOZ is still connected.
 */
export async function askToNotify(): Promise<void> {
  if (Platform.OS !== 'android' || Number(Platform.Version) < 33) return;
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) return;
  await PermissionsAndroid.request(permission);
}
