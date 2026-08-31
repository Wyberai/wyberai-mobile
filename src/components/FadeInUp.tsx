import { useEffect, type ReactNode } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
} from 'react-native-reanimated';
import { motion } from '@/lib/theme';
import { useReducedMotion } from '@/lib/useReducedMotion';

// Entrance animation matched to the web app's @keyframes fadeUp:
//   from { opacity: 0; transform: translateY(20px) }
//   to   { opacity: 1; transform: none }
// on the site's signature easing (cubic-bezier 0.16, 1, 0.3, 1). Wrap any block
// that should reveal on mount; pass an incrementing `delay` to stagger a list so
// cards cascade in rather than popping together.

const WEB_EASE = Easing.bezier(...motion.ease);

export function FadeInUp({
  children,
  delay = 0,
  distance = motion.rise,
  duration = motion.duration.base,
  style,
}: {
  children: ReactNode;
  delay?: number;
  distance?: number;
  duration?: number;
  style?: StyleProp<ViewStyle>;
}) {
  const reducedMotion = useReducedMotion();
  const progress = useSharedValue(reducedMotion ? 1 : 0);

  useEffect(() => {
    if (reducedMotion) {
      progress.value = 1;
      return;
    }
    // Firing withTiming synchronously in this effect can silently no-op if the
    // Reanimated UI-runtime binding isn't attached yet on the very first frame
    // after a cold mount (Home's hero, the first AgentFeed lanes) — content
    // then sits stuck at opacity:0 forever, present and touchable but invisible.
    // Deferring past two frames gives the UI runtime a chance to attach before
    // the animation is requested.
    let cancelled = false;
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => {
        if (!cancelled) progress.value = withDelay(delay, withTiming(1, { duration, easing: WEB_EASE }));
      });
    });
    // Belt-and-suspenders: if the animation above still never lands (backgrounded
    // mid-entrance, a stalled worklet runtime), force full visibility rather than
    // leave content permanently hidden.
    const safety = setTimeout(() => {
      if (!cancelled) progress.value = 1;
    }, delay + duration + 500);
    return () => {
      cancelled = true;
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
      clearTimeout(safety);
    };
  }, [delay, duration, progress, reducedMotion]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * distance }],
  }));

  return <Animated.View style={[style, animatedStyle]}>{children}</Animated.View>;
}

// Convenience: even stagger for list items. `STAGGER_STEP` ms between each,
// capped so long lists don't wait seconds for the last row.
export const STAGGER_STEP = 55;
export function staggerDelay(index: number, base = 0, cap = 8): number {
  return base + Math.min(index, cap) * STAGGER_STEP;
}
