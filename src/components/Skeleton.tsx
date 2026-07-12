import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type LayoutChangeEvent, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { LinearGradient } from 'expo-linear-gradient';
import { brand, motion, radius, space } from '@/lib/theme';

// Shimmer placeholder matched to the web app's @keyframes shimmer (a highlight
// sweeping across a muted surface, 1.5s linear, infinite). Use while data
// loads instead of a bare spinner — it communicates "content is coming" and
// reads as premium. Compose primitives (SkeletonBox) or drop in a ready-made
// SkeletonProjectCard / SkeletonGalleryCard.

function Shimmer({ style, children }: { style?: StyleProp<ViewStyle>; children?: ReactNode }) {
  const [w, setW] = useState(0);
  const t = useSharedValue(0);

  const onLayout = (e: LayoutChangeEvent) => {
    const next = e.nativeEvent.layout.width;
    if (next && next !== w) {
      setW(next);
      t.value = 0;
      t.value = withRepeat(
        withTiming(1, { duration: motion.duration.shimmer, easing: Easing.linear }),
        -1,
        false,
      );
    }
  };

  const bandStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: -w + t.value * (2 * w) }],
  }));

  return (
    <View style={[styles.base, style]} onLayout={onLayout}>
      {w > 0 ? (
        <Animated.View style={[StyleSheet.absoluteFill, bandStyle]}>
          <LinearGradient
            colors={['transparent', 'rgba(255,255,255,0.06)', 'rgba(255,255,255,0.10)', 'rgba(255,255,255,0.06)', 'transparent']}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={StyleSheet.absoluteFill}
          />
        </Animated.View>
      ) : null}
      {children}
    </View>
  );
}

export function SkeletonBox({
  width,
  height,
  rounded = radius.sm,
  style,
}: {
  width?: number | `${number}%`;
  height: number;
  rounded?: number;
  style?: StyleProp<ViewStyle>;
}) {
  return <Shimmer style={[{ width: width ?? '100%', height, borderRadius: rounded }, style]} />;
}

export function SkeletonProjectCard() {
  return (
    <View style={styles.card}>
      <SkeletonBox height={120} rounded={radius.md} />
      <View style={styles.cardRow}>
        <SkeletonBox width="55%" height={16} />
        <SkeletonBox width={44} height={16} rounded={radius.pill} />
      </View>
      <SkeletonBox width="80%" height={12} />
      <SkeletonBox width="40%" height={11} />
    </View>
  );
}

export function SkeletonGalleryCard() {
  return (
    <View style={styles.galleryCard}>
      <SkeletonBox height={110} rounded={0} />
      <View style={styles.galleryBody}>
        <SkeletonBox width="70%" height={13} />
        <SkeletonBox width="45%" height={11} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  base: { backgroundColor: brand.surfaceAlt, overflow: 'hidden' },
  card: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  cardRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.sm },
  galleryCard: {
    width: 190,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  galleryBody: { padding: space.md, gap: space.sm },
});
