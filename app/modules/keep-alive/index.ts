// The app's own native module: a foreground service that keeps the process
// running while the app is off the screen. See android/…/KeepAliveService.kt.

import { requireNativeModule } from 'expo-modules-core';

interface Subscription {
  remove(): void;
}

interface KeepAliveModule {
  /** Starts the service and its notification. Throws if Android refuses. */
  start(title: string, text: string, stopLabel: string): void;
  stop(): void;
  isRunning(): boolean;
  /** The service stopped by itself: the user tapped its action, or Android's daily limit ran out. */
  addListener(event: 'onStopped', listener: (event: { reason: 'user' | 'timeout' }) => void): Subscription;
}

export default requireNativeModule<KeepAliveModule>('KeepAlive');
