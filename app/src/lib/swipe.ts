// Swipe from the left edge to go back, for screens that have somewhere to
// go back to. Android's own back gesture still works; this is for phones
// set to buttons, and for people who expect it.

import { useMemo, useRef } from 'react';
import { PanResponder, type GestureResponderHandlers } from 'react-native';

/** How close to the left edge a swipe must start, and how far it must travel. */
const EDGE = 32;
const TRAVEL = 72;

/**
 * Handlers to spread on a screen's outermost view. A swipe that starts at
 * the screen's left edge and moves right calls `onBack`. Pass `enabled:
 * false` where the screen's left edge is not the window's.
 */
export function useBackSwipe(onBack: () => void, enabled = true): GestureResponderHandlers {
  const latest = useRef({ onBack, enabled });
  latest.current = { onBack, enabled };
  return useMemo(
    () =>
      PanResponder.create({
        // Taken from whatever is underneath (a list, a photo), but only for this one gesture.
        onMoveShouldSetPanResponderCapture: (_event, gesture) =>
          latest.current.enabled && gesture.x0 <= EDGE && gesture.dx > 12 && gesture.dx > Math.abs(gesture.dy) * 1.5,
        onPanResponderRelease: (_event, gesture) => {
          if (gesture.dx >= TRAVEL) latest.current.onBack();
        },
      }).panHandlers,
    [],
  );
}
