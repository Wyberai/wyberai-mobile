import { Pressable, Text, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { Easing, useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { brand, font, motion, radius, space } from '@/lib/theme';

const WEB_EASE = Easing.bezier(...motion.ease);

// Non-blocking "an OTA update is ready" banner — slides down from the top.
// Never reloads automatically; the user taps to apply it on their own schedule.
export function UpdateBanner({ onReload }: { onReload: () => void }) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);
  const [reloading, setReloading] = useState(false);

  useEffect(() => {
    progress.value = withTiming(1, { duration: motion.duration.base, easing: WEB_EASE });
  }, [progress]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -60 }],
  }));

  return (
    <Animated.View style={[styles.banner, { top: insets.top + space.sm }, animatedStyle]}>
      <Pressable
        style={[styles.content, reloading && styles.contentDisabled]}
        disabled={reloading}
        onPress={() => {
          // Reload is a fire-and-forget native call that doesn't resolve
          // before the app actually restarts — without this, a fast
          // double-tap could fire it twice.
          setReloading(true);
          onReload();
        }}
      >
        <Ionicons name="sparkles" size={16} color={brand.onAccent} />
        <Text style={styles.text}>{reloading ? 'Reloading…' : 'Update ready — tap to reload'}</Text>
        <Ionicons name="arrow-forward" size={16} color={brand.onAccent} />
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  banner: {
    position: 'absolute',
    left: space.lg,
    right: space.lg,
    zIndex: 100,
  },
  content: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: brand.accent,
    borderRadius: radius.pill,
    paddingVertical: space.sm + 2,
    paddingHorizontal: space.lg,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.25,
    shadowRadius: 10,
    elevation: 6,
  },
  contentDisabled: { opacity: 0.7 },
  text: { color: brand.onAccent, fontFamily: font.displayMedium, fontSize: 13 },
});
