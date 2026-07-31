import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';
import Animated, {
  Easing,
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { WyberIcon } from '@/components/WyberIcon';
import { WyberWordmark } from '@/components/WyberWordmark';
import { useReducedMotion } from '@/lib/useReducedMotion';
import { brand, SPRINGS } from '@/lib/theme';

// Staged splash-to-app transition: native splash (app.json expo-splash-screen)
// hides the instant this mounts, and this overlay takes over — icon springs
// in, wordmark slides up + fades, then the whole thing crossfades away to
// reveal the real app underneath (already mounting concurrently). ~900ms.
export function BrandedSplashOverlay({ onDone }: { onDone: () => void }) {
  const reducedMotion = useReducedMotion();
  const iconScale = useSharedValue(reducedMotion ? 1 : 0.6);
  const iconOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const wordmarkY = useSharedValue(reducedMotion ? 0 : 12);
  const wordmarkOpacity = useSharedValue(reducedMotion ? 1 : 0);
  const overlayOpacity = useSharedValue(1);

  useEffect(() => {
    // useReducedMotion() resolves asynchronously (starts `false` for at least
    // one render even when the OS setting is actually on), so this must react
    // to the real value once it lands — not just run once at mount, which
    // would always see the stale `false` and play the full animation
    // regardless of the setting.
    if (reducedMotion) {
      // Cancel whatever's in flight from an already-started animated run
      // (the false→true transition case) so it can't also fire onDone later.
      cancelAnimation(iconScale);
      cancelAnimation(iconOpacity);
      cancelAnimation(wordmarkY);
      cancelAnimation(wordmarkOpacity);
      cancelAnimation(overlayOpacity);
      const t = setTimeout(onDone, 200);
      return () => clearTimeout(t);
    }
    iconScale.value = withSpring(1, SPRINGS.EASE);
    iconOpacity.value = withTiming(1, { duration: 250, easing: Easing.out(Easing.quad) });
    wordmarkY.value = withDelay(150, withSpring(0, SPRINGS.FLOAT));
    wordmarkOpacity.value = withDelay(150, withTiming(1, { duration: 300 }));
    overlayOpacity.value = withDelay(
      650,
      withSequence(
        withTiming(1, { duration: 1 }),
        withTiming(0, { duration: 250 }, (finished) => {
          if (finished) runOnJS(onDone)();
        }),
      ),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reducedMotion]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity: iconOpacity.value,
    transform: [{ scale: iconScale.value }],
  }));
  const wordmarkStyle = useAnimatedStyle(() => ({
    opacity: wordmarkOpacity.value,
    transform: [{ translateY: wordmarkY.value }],
  }));
  const fillStyle = useAnimatedStyle(() => ({ opacity: overlayOpacity.value }));

  return (
    <Animated.View style={[styles.fill, fillStyle]} pointerEvents="none">
      <View style={styles.center}>
        <Animated.View style={iconStyle}>
          <WyberIcon size={56} color={brand.onAccent} />
        </Animated.View>
        <Animated.View style={[styles.wordmarkWrap, wordmarkStyle]}>
          <WyberWordmark width={130} color={brand.onAccent} accentColor={brand.accentSoft} />
        </Animated.View>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  fill: { ...StyleSheet.absoluteFill, backgroundColor: brand.accent, zIndex: 1000 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  wordmarkWrap: { alignItems: 'center' },
});
