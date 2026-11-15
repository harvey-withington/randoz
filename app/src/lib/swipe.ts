// Swipe from the left edge to go back, for a screen that has somewhere to go
// back to. Android's own back gesture still works; this is for phones set to
// buttons, and for people who expect it.

import { useMemo, useRef } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';

/** How close to the left edge a swipe must start, and how far it must travel. */
const EDGE = 32;
const TRAVEL = 72;

/**
 * Handlers to spread on a screen's outermost view. A one-finger swipe that
 * starts at the screen's left edge and moves right calls `onBack`. Pass
 * `enabled: false` where the screen's left edge is not the window's, or
 * where something else on the screen owns sideways swipes.
 */
export function useBackSwipe(onBack: () => void, enabled = true): GestureResponderHandlers {
  const latest = useRef({ onBack, enabled });
  latest.current = { onBack, enabled };
  // Where the finger first came down. The gesture's own x0 is not set until
  // this view owns the gesture, which is too late to decide whether it should.
  const from = useRef<number | null>(null);
  return useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponderCapture: (event) => {
          const { touches, pageX } = event.nativeEvent;
          // A second finger landing makes it a pinch, never a swipe back.
          from.current = touches.length === 1 ? pageX : null;
          return false;
        },
        // Taken from whatever is underneath (a list), but only for this one gesture.
        onMoveShouldSetPanResponderCapture: (event, gesture) =>
          latest.current.enabled &&
          event.nativeEvent.touches.length === 1 &&
          from.current !== null &&
          from.current <= EDGE &&
          gesture.dx > 12 &&
          gesture.dx > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_event, gesture) => {
          from.current = null;
          if (gesture.dx >= TRAVEL) latest.current.onBack();
        },
        onPanResponderTerminate: () => {
          from.current = null;
        },
      }).panHandlers,
    [],
  );
}
