import { useEffect, useRef, useState, type MutableRefObject } from 'react';
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
import { WYBER_GAME_SRC } from '@/lib/build-game';

// The reveal moment after a build: the freshly built app slides up INSIDE the
// chat screen — no navigation, no context switch. Same WebView contract as
// preview/[id].tsx. A failed preview build shows a calm card that hands off to
// the full preview screen; it can never touch chat state (caller mounts this
// inside a SafeWidget and only ever passes it display state).
//
// `refreshing` on the ready states matters: a REBUILD (not the first one)
// must never blank an already-working preview behind a spinner, or reopen a
// sheet the user closed — web's PreviewPanel.tsx explicitly guards against
// this exact regression (its own comment: a real user "saw FOUR simultaneous
// building indicators and rightly called it out"). `building` with no prior
// content is the only case shown full-screen, which is also why it's the
// only phase that renders the build-time filler game instead of a bare
// spinner — same condition web uses to show it (no existing preview yet).
export type RevealState =
  | { phase: 'hidden' }
  | { phase: 'building' }
  | { phase: 'ready'; url: string; refreshing?: boolean }
  | { phase: 'ready-html'; html: string; refreshing?: boolean }
  | { phase: 'error' };

export type RuntimeErrorInfo = { message: string; source?: string; line?: number; stack?: string };

// Reported by the injected mobile selection bridge (see
// lib/wyber-preview-mobile-bridge.ts) when the user taps an element while
// select mode is on.
export type SelectedElementInfo = {
  selector: string;
  tag: string;
  text: string;
  classes: string;
  loc: string | null;
};

/** Imperative handle for sending messages down to the bridge (optimistic
 * live class/text updates while the user is still adjusting — the real
 * source patch + rebuild happens separately). */
export type PreviewBridgeHandle = { postMessage: (json: string) => void };

const WEB_EASE = Easing.bezier(...motion.ease);

// Bridges uncaught JS errors inside the previewed app back to the native
// chat — this is what powers the AutoFix banner (build/[id].tsx). Injected
// once per WebView load, before the app's own bundle runs. Also emits a
// heartbeat every 2s — a genuine infinite render loop / runaway synchronous
// work freezes the WebView's single JS thread solid with no error ever
// firing, so a MISSED heartbeat is the only way to detect it (same
// mechanism web's PreviewPanel.tsx uses). CORS-blocked fetch calls are
// already reported as 'wyber-cors-error' by the server-side sanitizeFiles()
// pipeline that builds this HTML (src/lib/sanitize-files.ts's ERROR_RELAY,
// shared with web) — nothing extra to inject for that one, just listen.
const ERROR_BRIDGE_JS = `
(function() {
  function report(payload) {
    try { window.ReactNativeWebView.postMessage(JSON.stringify(payload)); } catch (e) {}
  }
  window.onerror = function(msg, src, line, col, err) {
    report({ type: 'rn_error', message: String(msg), source: src, line: line, stack: err && err.stack });
  };
  window.addEventListener('unhandledrejection', function(e) {
    var reason = e && e.reason;
    report({ type: 'rn_error', message: String(reason && reason.message || reason || 'Unhandled promise rejection'), stack: reason && reason.stack });
  });
  setInterval(function() { report({ type: 'wyber-heartbeat' }); }, 2000);
  true;
})();
`;

const HANG_THRESHOLD_MS = 10_000;
const HANG_CHECK_INTERVAL_MS = 3_000;

export function PreviewRevealSheet({
  state,
  onClose,
  onOpenFull,
  onRuntimeError,
  onLoadError,
  selectMode = false,
  onToggleSelectMode,
  onElementSelected,
  bridgeRef,
  dbHealth = null,
  onRestoreDb,
  storageWarning = false,
  onConnectSupabase,
}: {
  state: RevealState;
  onClose: () => void;
  onOpenFull: () => void;
  onRuntimeError?: (info: RuntimeErrorInfo) => void;
  /** The WebView itself failed to load (network blip, bad URL) — as opposed to
   * a runtime error inside a successfully-loaded page. Distinct from a silent
   * blank screen: without this, a failed load just renders nothing forever. */
  onLoadError?: () => void;
  /** Visual Edits — tap-to-select mode (see lib/wyber-preview-mobile-bridge.ts).
   * Only meaningful when the loaded HTML was built with the bridge injected
   * (build/[id].tsx's autoPreview, web/website/saas projects only). */
  selectMode?: boolean;
  onToggleSelectMode?: () => void;
  onElementSelected?: (info: SelectedElementInfo) => void;
  /** Parent-owned ref this component fills in with a postMessage function,
   * for sending optimistic wyber-set-class/wyber-set-text updates. */
  bridgeRef?: MutableRefObject<PreviewBridgeHandle | null>;
  /** Supabase free-tier auto-pause status — polled by the parent (build/[id].tsx),
   * this component just renders the banner/action. */
  dbHealth?: 'paused' | 'restoring' | null;
  onRestoreDb?: () => void;
  /** True when the generated app stores data only in local component state
   * with no backend connected — computed by the parent from `files`. */
  storageWarning?: boolean;
  onConnectSupabase?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const visible = state.phase !== 'hidden';
  const [rendered, setRendered] = useState(visible);
  const progress = useSharedValue(0);
  const sheetHeight = Math.round(height * 0.78);
  const webViewRef = useRef<WebView>(null);
  const lastHeartbeat = useRef(0);
  const [hung, setHung] = useState(false);
  const [corsNotice, setCorsNotice] = useState<{ message: string; url?: string } | null>(null);

  // Reset the baseline on every new build/load — otherwise the OLD WebView's
  // last heartbeat lingers and the watchdog could fire on a brand-new load
  // before it's even had a chance to send its first beat.
  const contentKey = state.phase === 'ready' ? state.url : state.phase === 'ready-html' ? state.html : null;
  useEffect(() => {
    lastHeartbeat.current = Date.now();
    setHung(false);
    setCorsNotice(null);
  }, [contentKey]);

  useEffect(() => {
    if (state.phase !== 'ready' && state.phase !== 'ready-html') return;
    const iv = setInterval(() => {
      if (Date.now() - lastHeartbeat.current > HANG_THRESHOLD_MS) setHung(true);
    }, HANG_CHECK_INTERVAL_MS);
    return () => clearInterval(iv);
  }, [state.phase]);

  useEffect(() => {
    if (!bridgeRef) return;
    bridgeRef.current = { postMessage: (json: string) => webViewRef.current?.postMessage(json) };
    return () => { bridgeRef.current = null; };
  }, [bridgeRef]);

  // Re-send the current select-mode state whenever it changes AND whenever
  // the page (re)loads — a fresh load resets the injected script's JS state,
  // so a stale "on" from before a rebuild would otherwise be lost silently.
  useEffect(() => {
    if (state.phase !== 'ready' && state.phase !== 'ready-html') return;
    webViewRef.current?.postMessage(JSON.stringify({ type: 'wyber-edit-mode', on: selectMode }));
  }, [selectMode, state.phase]);

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
              {(state.phase === 'ready' || state.phase === 'ready-html') && onToggleSelectMode ? (
                <Pressable
                  onPress={() => { tap(); onToggleSelectMode(); }}
                  hitSlop={8}
                  style={[styles.expandBtn, selectMode && styles.expandBtnActive]}
                >
                  <Ionicons name="locate-outline" size={14} color={selectMode ? brand.onAccent : brand.accent} />
                  <Text style={[styles.expandText, selectMode && styles.expandTextActive]}>
                    {selectMode ? 'Tap an element' : 'Edit'}
                  </Text>
                </Pressable>
              ) : null}
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

          {dbHealth === 'paused' ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                ⏸ Your Supabase database is <Text style={styles.bannerBold}>paused</Text> (free projects pause after a
                week of inactivity) — nothing will load or save until it's restored.
              </Text>
              <Pressable onPress={() => { tap(); onRestoreDb?.(); }} style={styles.bannerBtn}>
                <Text style={styles.bannerBtnText}>Restore now</Text>
              </Pressable>
            </View>
          ) : dbHealth === 'restoring' ? (
            <View style={[styles.banner, styles.bannerWarn]}>
              <Spinner size={11} color="#fbbf24" />
              <Text style={[styles.bannerText, styles.bannerTextWarn]}>Restoring your database — usually takes under a minute…</Text>
            </View>
          ) : null}

          {hung ? (
            <View style={styles.banner}>
              <Text style={styles.bannerText}>
                ⚠ The preview seems to have <Text style={styles.bannerBold}>frozen</Text> (unresponsive for 10s+) —
                this usually means something in the app is stuck in a loop.
              </Text>
              <Pressable
                onPress={() => { tap(); setHung(false); lastHeartbeat.current = Date.now(); webViewRef.current?.reload(); }}
                style={styles.bannerBtn}
              >
                <Text style={styles.bannerBtnText}>Reload preview</Text>
              </Pressable>
            </View>
          ) : null}

          {corsNotice ? (
            <View style={[styles.banner, styles.bannerWarn]}>
              <Text style={[styles.bannerText, styles.bannerTextWarn]}>
                ⚠ This app tried to call {corsNotice.url ? <Text style={styles.bannerCode}>{corsNotice.url}</Text> : 'an external API'} directly, and
                that API's server doesn't allow requests from this origin (CORS). This usually needs a server-side
                proxy for that call, not a builder fix.
              </Text>
              <Pressable onPress={() => setCorsNotice(null)} hitSlop={8}>
                <Ionicons name="close" size={16} color="#fef3c7" />
              </Pressable>
            </View>
          ) : null}

          {storageWarning && (state.phase === 'ready' || state.phase === 'ready-html') && !state.refreshing ? (
            <View style={[styles.banner, styles.bannerWarn]}>
              <Text style={[styles.bannerText, styles.bannerTextWarn]}>
                ⚠ Data is stored in browser memory only — resets on refresh. Connect a database to save permanently.
              </Text>
              <Pressable onPress={() => { tap(); onConnectSupabase?.(); }}>
                <Text style={styles.bannerLink}>Connect Supabase →</Text>
              </Pressable>
            </View>
          ) : null}

          {state.phase === 'building' ? (
            <View style={styles.gameWrap}>
              <WebView
                source={{ html: WYBER_GAME_SRC }}
                style={styles.web}
                originWhitelist={['*']}
                javaScriptEnabled
              />
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
              {state.refreshing ? (
                <View style={styles.refreshingPill} pointerEvents="none">
                  <Spinner size={14} />
                  <Text style={styles.refreshingText}>Updating preview…</Text>
                </View>
              ) : null}
              <WebView
                ref={webViewRef}
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
                injectedJavaScriptBeforeContentLoaded={ERROR_BRIDGE_JS}
                onMessage={(e) => {
                  try {
                    const data = JSON.parse(e.nativeEvent.data);
                    if (data?.type === 'rn_error') onRuntimeError?.(data);
                    else if (data?.type === 'wyber-element-selected') onElementSelected?.(data);
                    else if (data?.type === 'wyber-heartbeat') {
                      lastHeartbeat.current = Date.now();
                      if (hung) setHung(false);
                    } else if (data?.type === 'wyber-cors-error') {
                      setCorsNotice({ message: String(data.message || ''), url: data.url });
                    }
                  } catch {
                    // In-app render failures show their own fallback card inside
                    // the WebView — a non-JSON message is nothing to act on.
                  }
                }}
                onError={() => onLoadError?.()}
                onHttpError={() => onLoadError?.()}
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
  expandBtnActive: { backgroundColor: brand.accent },
  expandTextActive: { color: brand.onAccent },
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
  gameWrap: { flex: 1, backgroundColor: '#09090b' },
  refreshingPill: {
    position: 'absolute',
    bottom: 14,
    alignSelf: 'center',
    zIndex: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: 'rgba(17,17,24,0.92)',
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.md,
    paddingVertical: 6,
  },
  refreshingText: { color: brand.text, fontSize: 11.5, fontWeight: '600' },
  banner: {
    flexShrink: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
    backgroundColor: 'rgba(127,29,29,0.92)',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(248,113,113,0.25)',
  },
  bannerWarn: { backgroundColor: 'rgba(120,53,15,0.9)', borderBottomColor: 'rgba(251,191,36,0.2)' },
  bannerText: { flex: 1, color: '#fecaca', fontSize: 11, lineHeight: 15 },
  bannerTextWarn: { color: '#fef3c7' },
  bannerBold: { fontWeight: '700' },
  bannerCode: { fontFamily: 'monospace', backgroundColor: 'rgba(0,0,0,0.2)' },
  bannerBtn: { backgroundColor: '#ef4444', borderRadius: radius.sm, paddingHorizontal: space.sm + 2, paddingVertical: 5 },
  bannerBtnText: { color: '#fff', fontSize: 11, fontWeight: '700' },
  bannerLink: { color: '#fbbf24', fontSize: 11, fontWeight: '600' },
});
