import { useMemo, useRef, useState } from 'react';
import { Animated, PanResponder, View, type GestureResponderEvent } from 'react-native';

interface Props {
  uri: string;
  label: string;
  /** A sideways swipe while not zoomed in: 1 for leftwards (the next), -1 for rightwards. */
  onSwipe?: (direction: 1 | -1) => void;
}

const MAX_SCALE = 5;
const DOUBLE_TAP_SCALE = 2.5;
const DOUBLE_TAP_MS = 280;
const SWIPE = 64;

const distance = (event: GestureResponderEvent): number => {
  const [a, b] = event.nativeEvent.touches;
  return Math.hypot(a.pageX - b.pageX, a.pageY - b.pageY);
};

/**
 * A photo that fills its space and can be zoomed: pinch with two fingers,
 * drag to move around once zoomed in, double tap to zoom in and back out.
 */
export function ZoomImage({ uri, label, onSwipe }: Props) {
  const swiped = useRef(onSwipe);
  swiped.current = onSwipe;
  const [size, setSize] = useState({ width: 0, height: 0 });
  const box = useRef(size);
  box.current = size;

  // Where the picture is now, and where it was when this gesture began.
  const scale = useRef(new Animated.Value(1)).current;
  const shift = useRef(new Animated.ValueXY({ x: 0, y: 0 })).current;
  const now = useRef({ scale: 1, x: 0, y: 0 });
  const start = useRef({ scale: 1, x: 0, y: 0, pinch: 0 });
  const lastTap = useRef(0);

  const responder = useMemo(() => {
    const place = (nextScale: number, x: number, y: number) => {
      // Never further than the edge of the zoomed picture.
      const maxX = (box.current.width * (nextScale - 1)) / 2;
      const maxY = (box.current.height * (nextScale - 1)) / 2;
      now.current = {
        scale: nextScale,
        x: Math.max(-maxX, Math.min(maxX, x)),
        y: Math.max(-maxY, Math.min(maxY, y)),
      };
      scale.setValue(now.current.scale);
      shift.setValue({ x: now.current.x, y: now.current.y });
    };
    const settle = (nextScale: number) => {
      now.current = { scale: nextScale, x: 0, y: 0 };
      Animated.parallel([
        Animated.timing(scale, { toValue: nextScale, duration: 160, useNativeDriver: true }),
        Animated.timing(shift, { toValue: { x: 0, y: 0 }, duration: 160, useNativeDriver: true }),
      ]).start();
    };

    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        start.current = { ...now.current, pinch: 0 };
      },
      onPanResponderMove: (event, gesture) => {
        if (event.nativeEvent.touches.length >= 2) {
          const apart = distance(event);
          // A second finger just landed: measure from here.
          if (start.current.pinch === 0) start.current = { ...now.current, pinch: apart };
          const next = Math.max(1, Math.min(MAX_SCALE, (start.current.scale * apart) / start.current.pinch));
          place(next, now.current.x, now.current.y);
        } else if (now.current.scale > 1) {
          // Back to one finger after a pinch: drag from where the picture is now.
          if (start.current.pinch !== 0) start.current = { ...now.current, x: now.current.x - gesture.dx, y: now.current.y - gesture.dy, pinch: 0 };
          place(now.current.scale, start.current.x + gesture.dx, start.current.y + gesture.dy);
        }
      },
      onPanResponderRelease: (_event, gesture) => {
        // Not zoomed in, one finger, mostly sideways: on to the next photo.
        const sideways = Math.abs(gesture.dx) >= SWIPE && Math.abs(gesture.dx) > Math.abs(gesture.dy) * 1.5;
        if (now.current.scale < 1.05 && start.current.pinch === 0 && sideways) {
          swiped.current?.(gesture.dx < 0 ? 1 : -1);
          return;
        }
        if (now.current.scale < 1.05) settle(1);
        const still = Math.abs(gesture.dx) < 8 && Math.abs(gesture.dy) < 8 && start.current.pinch === 0;
        if (!still) return;
        const time = Date.now();
        if (time - lastTap.current < DOUBLE_TAP_MS) {
          lastTap.current = 0;
          settle(now.current.scale > 1 ? 1 : DOUBLE_TAP_SCALE);
        } else {
          lastTap.current = time;
        }
      },
    });
  }, [scale, shift]);

  return (
    <View
      style={{ flex: 1, alignSelf: 'stretch', overflow: 'hidden' }}
      onLayout={(event) => setSize(event.nativeEvent.layout)}
      {...responder.panHandlers}
    >
      <Animated.Image
        accessibilityLabel={label}
        source={{ uri }}
        resizeMode="contain"
        style={{
          width: '100%',
          height: '100%',
          transform: [{ translateX: shift.x }, { translateY: shift.y }, { scale }],
        }}
      />
    </View>
  );
}
