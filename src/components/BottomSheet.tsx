import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { brand, font, motion, radius, space } from '@/lib/theme';
import { tap } from '@/lib/haptics';

export type SheetAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  description?: string;
  onPress: () => void;
  destructive?: boolean;
  tint?: string;
};

const WEB_EASE = Easing.bezier(...motion.ease);

// A premium action sheet that slides up over a fading scrim — the modern
// replacement for a stacked Alert.alert menu. Controlled via `visible`; it
// animates itself out before unmounting so dismissal never snaps. Rows follow
// the web design system (surface cards, sky-tinted icon wells, --ease motion).
export function BottomSheet({
  visible,
  title,
  subtitle,
  actions,
  onClose,
}: {
  visible: boolean;
  title?: string;
  subtitle?: string;
  actions: SheetAction[];
  onClose: () => void;
}) {
  const insets = useSafeAreaInsets();
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Mount-before-animate: `rendered` drives the Modal's own mount, so this
      // must be a synchronous effect reset in step with the `visible` prop.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setRendered(true);
      progress.value = withTiming(1, { duration: motion.duration.base, easing: WEB_EASE });
    } else if (rendered) {
      progress.value = withTiming(
        0,
        { duration: motion.duration.fast + 60, easing: WEB_EASE },
        (finished) => {
          if (finished) runOnJS(setRendered)(false);
        },
      );
    }
  }, [visible, rendered, progress]);

  const scrimStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const sheetStyle = useAnimatedStyle(() => ({
    // Travel a touch further than the sheet's own height cannot be measured
    // synchronously, so use a fixed rise that reads as a full slide-up.
    transform: [{ translateY: (1 - progress.value) * 340 }],
    opacity: 0.4 + progress.value * 0.6,
  }));

  function choose(action: SheetAction) {
    tap();
    // Close first (starts the exit animation), then run the action on the next
    // tick so navigation doesn't fight the dismiss.
    onClose();
    setTimeout(action.onPress, 10);
  }

  if (!rendered) return null;

  return (
    <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <AnimatedPressable style={[styles.scrim, scrimStyle]} onPress={onClose} />
        <Animated.View style={[styles.sheet, sheetStyle, { paddingBottom: insets.bottom + space.md }]}>
          <View style={styles.handle} />
          {title ? <Text style={styles.title}>{title}</Text> : null}
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
          <View style={styles.actions}>
            {actions.map((a) => (
              <Pressable
                key={a.label}
                onPress={() => choose(a)}
                style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
              >
                <View style={[styles.iconWell, a.destructive && styles.iconWellDanger]}>
                  <Ionicons
                    name={a.icon}
                    size={19}
                    color={a.destructive ? brand.danger : a.tint ?? brand.accent}
                  />
                </View>
                <View style={styles.rowText}>
                  <Text style={[styles.rowLabel, a.destructive && styles.rowLabelDanger]}>{a.label}</Text>
                  {a.description ? <Text style={styles.rowDesc}>{a.description}</Text> : null}
                </View>
                <Ionicons name="chevron-forward" size={16} color={brand.textFaint} />
              </Pressable>
            ))}
          </View>
          <Pressable onPress={onClose} style={({ pressed }) => [styles.cancel, pressed && styles.rowPressed]}>
            <Text style={styles.cancelText}>Cancel</Text>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

const styles = StyleSheet.create({
  fill: { flex: 1, justifyContent: 'flex-end' },
  scrim: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(6,6,10,0.62)' },
  sheet: {
    backgroundColor: brand.surface,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    borderTopWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: brand.border,
    marginBottom: space.md,
  },
  title: { color: brand.text, fontSize: 17, fontFamily: font.display, letterSpacing: -0.3 },
  subtitle: { color: brand.textMuted, fontSize: 13, marginTop: 2, marginBottom: space.xs },
  actions: { gap: space.sm, marginTop: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  rowPressed: { backgroundColor: brand.border, opacity: 0.9 },
  iconWell: {
    width: 38,
    height: 38,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  iconWellDanger: { backgroundColor: 'rgba(239,68,68,0.12)' },
  rowText: { flex: 1, gap: 1 },
  rowLabel: { color: brand.text, fontSize: 15, fontWeight: '700' },
  rowLabelDanger: { color: brand.danger },
  rowDesc: { color: brand.textFaint, fontSize: 12, lineHeight: 16 },
  cancel: {
    alignItems: 'center',
    paddingVertical: space.md,
    marginTop: space.sm,
    borderRadius: radius.md,
  },
  cancelText: { color: brand.textMuted, fontSize: 15, fontWeight: '700' },
});
