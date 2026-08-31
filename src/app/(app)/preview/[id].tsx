import { useCallback, useEffect, useRef, useState } from 'react';
import { Alert, Pressable, Share, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import * as ScreenOrientation from 'expo-screen-orientation';
import * as Clipboard from 'expo-clipboard';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Spinner } from '@/components/Spinner';
import { useToast } from '@/components/Toast';
import { supabase } from '@/lib/supabase';
import { buildPreview, buildMobilePreviewHtml, checkPreviewAccess, type FileMap } from '@/lib/api';
import { useT } from '@/lib/i18n/useT';
import { PREVIEW_SCREEN_STRINGS } from '@/lib/i18n/dict/preview-screen';
import { brand, radius, space } from '@/lib/theme';

type State =
  | { phase: 'building' }
  | { phase: 'gated'; message: string }
  | { phase: 'ready'; url: string }
  | { phase: 'ready-html'; html: string }
  | { phase: 'error'; message: string };

// Cheap game-engine sniff — mirrors the web app's /api/preview-access heuristic
// (src/app/api/preview-access/route.ts) so the mobile client's game-mode UI
// (landscape lock, fullscreen, audio unlock) and the server's 5cr-vs-2cr charge
// agree on the same project. Kept in sync manually — no shared package between
// the two repos.
const GAME_SIGNALS = ['canvas', 'p5.js', 'p5.min.js', 'three.js', 'phaser', 'matter.js', 'matter-js'];
function detectGame(files: FileMap): boolean {
  const blob = Object.values(files).map((f) => f.content ?? '').join('\n').toLowerCase();
  return GAME_SIGNALS.some((sig) => blob.includes(sig));
}

// Injected once the user taps the audio-unlock overlay — browsers (and RN's
// WebView) block AudioContext until a user gesture; this creates one inside
// the page so any subsequent audio the game plays isn't silently swallowed.
const UNLOCK_AUDIO_JS = `
(function() {
  try {
    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (Ctx && !window.__wyberAudioUnlocked) {
      var ctx = new Ctx();
      var buffer = ctx.createBuffer(1, 1, 22050);
      var src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(ctx.destination);
      src.start(0);
      window.__wyberAudioUnlocked = true;
    }
  } catch (e) {}
  true;
})();
`;

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT(PREVIEW_SCREEN_STRINGS);
  const [state, setState] = useState<State>({ phase: 'building' });
  // The durable link to share is the PUBLISHED url; the preview url is transient.
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);
  const [isGame, setIsGame] = useState(false);
  const [audioUnlocked, setAudioUnlocked] = useState(false);
  const webViewRef = useRef<WebView>(null);
  const showToast = useToast();

  const onCopyPreviewLink = useCallback(() => {
    if (!id) return;
    Clipboard.setStringAsync(`https://wyberai.com/go/${id}`);
    showToast('Preview link copied', 'success');
  }, [id, showToast]);

  const onShare = useCallback(() => {
    if (publishedUrl) {
      Share.share({ message: publishedUrl, url: publishedUrl });
    } else {
      Alert.alert(t('publishToShare'), t('publishToShareBody'), [{ text: t('ok') }]);
    }
  }, [publishedUrl, t]);

  const build = useCallback(async () => {
    if (!id) return;
    setState({ phase: 'building' });
    try {
      const { data } = await supabase
        .from('projects')
        .select('files,project_type,published_url,name,mobile_bundle_url,mobile_bundled_at')
        .eq('id', id)
        .maybeSingle();
      setPublishedUrl((data?.published_url as string | null) ?? null);
      const files = (data?.files as FileMap) ?? {};
      if (Object.keys(files).length === 0) {
        setState({ phase: 'error', message: 'Nothing to preview yet — build something first.' });
        return;
      }

      const game = detectGame(files);
      setIsGame(game);

      const access = await checkPreviewAccess(id);
      if (!access.ok) {
        // Fail CLOSED — this gate exists to stop unpaid previews from
        // rendering, so any failure (network error, 500, missing token) must
        // block the preview too, not just the explicit 'upgrade' case.
        if ('gate' in access && access.gate === 'upgrade') {
          setState({
            phase: 'gated',
            message: 'The builder needs to top up credits to share this preview.',
          });
        } else {
          const reason = 'error' in access ? access.error : undefined;
          setState({
            phase: 'error',
            message: reason || "Couldn't verify preview access — check your connection and try again.",
          });
        }
        return;
      }

      if (data?.project_type === 'mobile') {
        // Fast path: use pre-bundled URL if it was cached within the last 30 min
        // (the web editor fires /api/mobile-bundle after every generation).
        const bundledAt = data?.mobile_bundled_at as string | null;
        const bundleUrl = data?.mobile_bundle_url as string | null;
        const age = bundledAt ? Date.now() - new Date(bundledAt).getTime() : Infinity;
        if (bundleUrl && age < 30 * 60 * 1000) {
          setState({ phase: 'ready', url: bundleUrl });
        } else {
          // Bundle is stale or missing — build inline (falls back to WyberAi's own server)
          const html = await buildMobilePreviewHtml(id, files);
          setState({ phase: 'ready-html', html });
        }
      } else {
        const url = await buildPreview(id, files);
        setState({ phase: 'ready', url });
      }
    } catch (e) {
      setState({ phase: 'error', message: (e as Error).message });
    }
  }, [id]);

  useEffect(() => {
    // Fetch-on-mount: build() sets state only after its own awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    build();
  }, [build]);

  const inGameMode = isGame && (state.phase === 'ready' || state.phase === 'ready-html');

  // Lock landscape while the WebView is showing a game; always restore
  // portrait on the way out (mode change or unmount).
  useEffect(() => {
    if (inGameMode) {
      ScreenOrientation.lockAsync(ScreenOrientation.OrientationLock.LANDSCAPE_RIGHT).catch(() => {});
    } else {
      ScreenOrientation.unlockAsync().catch(() => {});
    }
    return () => {
      ScreenOrientation.unlockAsync().catch(() => {});
    };
  }, [inGameMode]);

  function exitGameMode() {
    ScreenOrientation.unlockAsync().catch(() => {});
    router.replace(`/build/${id}`);
  }

  if (state.phase === 'gated') {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ title: t('preview') }} />
        <View style={styles.center}>
          <Ionicons name="lock-closed-outline" size={36} color={brand.textMuted} />
          <Text style={styles.errorTitle}>Preview locked</Text>
          <Text style={styles.errorText}>{state.message}</Text>
          <Pressable onPress={build} style={styles.retry}>
            <Text style={styles.retryText}>{t('tryAgain')}</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  if (inGameMode) {
    return (
      <View style={styles.flex}>
        <Stack.Screen options={{ headerShown: false }} />
        <StatusBar hidden />
        <WebView
          ref={webViewRef}
          source={state.phase === 'ready-html' ? { html: state.html } : { uri: (state as { phase: 'ready'; url: string }).url }}
          style={styles.flex}
          startInLoadingState
          renderLoading={() => (
            <View style={[styles.center, styles.webLoading]}>
              <Spinner />
            </View>
          )}
          originWhitelist={['*']}
          javaScriptEnabled
          domStorageEnabled
          mediaPlaybackRequiresUserAction={false}
          allowsInlineMediaPlayback
          onError={(e) => setState({ phase: 'error', message: e.nativeEvent.description || 'Failed to load preview' })}
          onHttpError={(e) => setState({ phase: 'error', message: `Preview server returned ${e.nativeEvent.statusCode}` })}
        />
        {!audioUnlocked ? (
          <Pressable
            style={styles.audioUnlockOverlay}
            onPress={() => {
              webViewRef.current?.injectJavaScript(UNLOCK_AUDIO_JS);
              setAudioUnlocked(true);
            }}
          >
            <Ionicons name="volume-high-outline" size={28} color="#fff" />
            <Text style={styles.audioUnlockText}>Tap to enable sound</Text>
          </Pressable>
        ) : null}
        <Pressable
          style={[
            styles.gameExitButton,
            // Locked landscape + hidden status bar means the notch/Dynamic
            // Island sits on a SIDE here, not the top — a fixed offset from
            // the raw edge (previously space.lg) could sit right under it.
            { top: Math.max(insets.top, space.lg), right: Math.max(insets.right, space.lg) },
          ]}
          onPress={exitGameMode}
          hitSlop={10}
        >
          <Ionicons name="close" size={20} color="#fff" />
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: t('preview'),
          // These detail screens live in the Tabs group (href:null), so there's
          // no automatic stack back button — Android back would jump to Home.
          // Add an explicit chevron back to the builder (router.back is
          // unreliable across tab routes; navigate deterministically).
          headerLeft: () => (
            <Pressable onPress={() => router.replace(`/build/${id}`)} hitSlop={10} style={styles.refresh}>
              <Ionicons name="chevron-back" size={24} color={brand.accent} />
            </Pressable>
          ),
          headerRight: () => (
            <View style={styles.headerRow}>
              <Pressable onPress={onCopyPreviewLink} hitSlop={8} style={styles.refresh}>
                <Ionicons name="link-outline" size={18} color={brand.accent} />
              </Pressable>
              <Pressable onPress={onShare} hitSlop={8} style={styles.refresh}>
                <Ionicons name="share-outline" size={18} color={brand.accent} />
              </Pressable>
              <Pressable onPress={build} hitSlop={8} style={styles.refresh}>
                <Ionicons name="refresh" size={18} color={brand.accent} />
              </Pressable>
            </View>
          ),
        }}
      />

      {state.phase === 'building' ? (
        <View style={styles.center}>
          <Spinner />
          <Text style={styles.muted}>{t('buildingPreview')}</Text>
        </View>
      ) : state.phase === 'error' ? (
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={36} color={brand.textMuted} />
          <Text style={styles.errorTitle}>{t('notReadyYet')}</Text>
          <Text style={styles.errorText}>{friendlyMessage(state.message, t)}</Text>
          <Pressable onPress={build} style={styles.retry}>
            <Text style={styles.retryText}>{t('tryAgain')}</Text>
          </Pressable>
        </View>
      ) : (
        <WebView
          source={state.phase === 'ready-html' ? { html: state.html } : { uri: state.url }}
          style={styles.flex}
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
            // The preview posts {type:'preview-error'} on an in-app render
            // failure. Its own calm fallback card is already showing inside the
            // WebView, so we intentionally don't stack another error over it.
          }}
          onError={(e) => setState({ phase: 'error', message: e.nativeEvent.description || 'Failed to load preview' })}
          onHttpError={(e) => setState({ phase: 'error', message: `Preview server returned ${e.nativeEvent.statusCode}` })}
        />
      )}
    </View>
  );
}

// Turn a raw build/network message into one calm sentence. Nothing scary, no
// stack traces — those never belong in front of the user.
function friendlyMessage(raw: string, t: ReturnType<typeof useT<typeof PREVIEW_SCREEN_STRINGS.en>>): string {
  const m = (raw || '').toLowerCase();
  if (m.includes('nothing to preview') || m.includes('build something')) {
    return t('buildSomethingFirst');
  }
  if (m.includes('network') || m.includes('failed to fetch') || m.includes('timeout')) {
    return t('couldntReachService');
  }
  if (m.includes('no app') || m.includes('no-entry')) {
    return t('noAppEntry');
  }
  return t('genericPreviewError');
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  webLoading: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: brand.bg },
  muted: { color: brand.textMuted, fontSize: 14 },
  errorTitle: { color: brand.text, fontSize: 17, fontWeight: '700' },
  errorText: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 300 },
  retry: {
    backgroundColor: brand.accent,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.md,
    marginTop: space.sm,
  },
  retryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  refresh: { padding: 4 },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  audioUnlockOverlay: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
  },
  audioUnlockText: { color: '#fff', fontSize: 14, fontWeight: '600' },
  gameExitButton: {
    position: 'absolute',
    top: space.lg,
    right: space.lg,
    width: 36,
    height: 36,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(0,0,0,0.5)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
