import { useEffect, useRef } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { FadeInUp } from '@/components/FadeInUp';
import { tap } from '@/lib/haptics';
import { brand, motion, radius, space } from '@/lib/theme';

// The build moment as theater: each [progress:] line cascades in, earlier
// steps flip to green checkmarks, and a thin bar eases forward — with a
// throttled haptic tick per new step. Purely presentational: it renders the
// same `progress` array the plain checklist did, and it always mounts inside
// a SafeWidget with that plain checklist as the fallback.

const WEB_EASE = Easing.bezier(...motion.ease);

export function BuildTheater({ progress }: { progress: string[] }) {
  const lastCount = useRef(0);
  const lastTick = useRef(0);
  const bar = useSharedValue(0);

  useEffect(() => {
    if (progress.length > lastCount.current) {
      lastCount.current = progress.length;
      // Heuristic completion: creeps toward 100% without ever claiming it.
      bar.value = withTiming(progress.length / (progress.length + 2), {
        duration: motion.duration.reveal,
        easing: WEB_EASE,
      });
      const now = Date.now();
      if (now - lastTick.current >= 500) {
        lastTick.current = now;
        tap();
      }
    }
  }, [progress.length, bar]);

  const barStyle = useAnimatedStyle(() => ({
    width: `${Math.min(bar.value, 0.96) * 100}%`,
  }));

  if (progress.length === 0) return null;

  return (
    <View style={styles.wrap}>
      <View style={styles.barTrack}>
        <Animated.View style={[styles.barFill, barStyle]} />
      </View>
      {progress.map((p, i) => {
        const current = i === progress.length - 1;
        return (
          <FadeInUp key={`${i}-${p}`} distance={10} duration={motion.duration.fast + 100}>
            <View style={styles.row}>
              <Ionicons
                name={current ? 'ellipse-outline' : 'checkmark-circle'}
                size={14}
                color={current ? brand.accent : brand.success}
              />
              <Text style={[styles.text, current && styles.textCurrent]} numberOfLines={2}>
                {p}
              </Text>
            </View>
          </FadeInUp>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginBottom: 4 },
  barTrack: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: brand.surfaceAlt,
    overflow: 'hidden',
    marginBottom: space.xs,
  },
  barFill: {
    height: 3,
    borderRadius: radius.pill,
    backgroundColor: brand.accent,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  text: { color: brand.textMuted, fontSize: 13, flexShrink: 1 },
  textCurrent: { color: brand.text },
});
