import { useEffect, useState } from 'react';
import { Modal, Pressable, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Spinner } from '@/components/Spinner';
import { brand, font, motion, radius, space } from '@/lib/theme';
import { tap } from '@/lib/haptics';

// The reveal moment after a build: the freshly built app slides up INSIDE the
// chat screen — no navigation, no context switch. Same WebView contract as
// preview/[id].tsx. A failed preview build shows a calm card that hands off to
// the full preview screen; it can never touch chat state (caller mounts this
// inside a SafeWidget and only ever passes it display state).

export type RevealState =
  | { phase: 'hidden' }
  | { phase: 'building' }
  | { phase: 'ready'; url: string }
  | { phase: 'ready-html'; html: string }
  | { phase: 'error' };

const WEB_EASE = Easing.bezier(...motion.ease);

export function PreviewRevealSheet({
  state,
  onClose,
  onOpenFull,
}: {
  state: RevealState;
  onClose: () => void;
  onOpenFull: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const visible = state.phase !== 'hidden';
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(0);
  const sheetHeight = Math.round(height * 0.78);

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
    transform: [{ translateY: (1 - progress.value) * sheetHeight }],
  }));

  if (!rendered) return null;

  return (
    <Modal transparent visible={rendered} animationType="none" onRequestClose={onClose} statusBarTranslucent>
      <View style={styles.fill}>
        <AnimatedPressable style={[styles.scrim, scrimStyle]} onPress={onClose} />
        <Animated.View
          style={[styles.sheet, sheetStyle, { height: sheetHeight, paddingBottom: insets.bottom }]}
        >
          <View style={styles.header}>
            <View style={styles.handle} />
            <View style={styles.headerRow}>
              <View style={styles.headerText}>
                <Text style={styles.title}>
                  {state.phase === 'building' ? 'Bringing it to life…' : state.phase === 'error' ? 'Preview' : '✦ Your app, live'}
                </Text>
              </View>
              {state.phase === 'ready' || state.phase === 'ready-html' ? (
                <Pressable
                  onPress={() => { tap(); onOpenFull(); }}
                  hitSlop={8}
                  style={styles.expandBtn}
                >
                  <Ionicons name="expand-outline" size={15} color={brand.accent} />
                  <Text style={styles.expandText}>Full preview</Text>
                </Pressable>
              ) : null}
              <Pressable onPress={() => { tap(); onClose(); }} hitSlop={10}>
                <Ionicons name="chevron-down" size={22} color={brand.textMuted} />
              </Pressable>
            </View>
          </View>

          {state.phase === 'building' ? (
            <View style={styles.center}>
              <Spinner />
              <Text style={styles.muted}>Rendering your app…</Text>
            </View>
          ) : state.phase === 'error' ? (
            <View style={styles.center}>
              <Ionicons name="cube-outline" size={32} color={brand.textMuted} />
              <Text style={styles.errorTitle}>Preview needs another moment</Text>
              <Text style={styles.errorBody}>
                Your build was saved — the quick preview just didn’t come up. Open the full preview to try again.
              </Text>
              <Pressable onPress={() => { tap(); onOpenFull(); }} style={styles.retry}>
                <Text style={styles.retryText}>Open preview screen</Text>
              </Pressable>
            </View>
          ) : state.phase === 'ready' || state.phase === 'ready-html' ? (
            <View style={styles.webWrap}>
              <WebView
                source={state.phase === 'ready-html' ? { html: state.html } : { uri: state.url }}
                style={styles.web}
                startInLoadingState
                renderLoading={() => (
                  <View style={[styles.center, styles.webLoading]}>
                    <Spinner />
                  </View>
                )}
                originWhitelist={['*']}
                javaScriptEnabled
                domStorageEnabled
                onMessage={() => {
                  // In-app render failures show their own fallback card inside
                  // the WebView — don't stack another error on top.
                }}
              />
            </View>
          ) : null}
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
    backgroundColor: brand.bg,
    borderTopLeftRadius: radius.lg + 6,
    borderTopRightRadius: radius.lg + 6,
    borderTopWidth: 1,
    borderColor: brand.border,
    overflow: 'hidden',
  },
  header: {
    paddingHorizontal: space.lg,
    paddingTop: space.sm,
    paddingBottom: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
    backgroundColor: brand.surface,
  },
  handle: {
    alignSelf: 'center',
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: brand.border,
    marginBottom: space.sm,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  headerText: { flex: 1 },
  title: { color: brand.text, fontSize: 16, fontFamily: font.display, letterSpacing: -0.3 },
  expandBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 5,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,165,233,0.12)',
  },
  expandText: { color: brand.accent, fontSize: 12, fontWeight: '700' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  muted: { color: brand.textMuted, fontSize: 14 },
  errorTitle: { color: brand.text, fontSize: 16, fontWeight: '700' },
  errorBody: { color: brand.textMuted, fontSize: 13.5, textAlign: 'center', lineHeight: 19, maxWidth: 300 },
  retry: {
    backgroundColor: brand.accent,
    paddingHorizontal: space.xl,
    paddingVertical: space.md - 2,
    borderRadius: radius.md,
    marginTop: space.xs,
  },
  retryText: { color: brand.onAccent, fontSize: 14, fontWeight: '700' },
  webWrap: { flex: 1, backgroundColor: brand.bg },
  web: { flex: 1, backgroundColor: brand.bg },
  webLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: brand.bg },
});
