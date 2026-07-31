import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { Spinner } from '@/components/Spinner';
import { supabase } from '@/lib/supabase';
import { buildPreview, buildMobilePreviewHtml, type FileMap } from '@/lib/api';
import { useT } from '@/lib/i18n/useT';
import { PREVIEW_SCREEN_STRINGS } from '@/lib/i18n/dict/preview-screen';
import { brand, radius, space } from '@/lib/theme';

type State =
  | { phase: 'building' }
  | { phase: 'ready'; url: string }
  | { phase: 'ready-html'; html: string }
  | { phase: 'error'; message: string };

export default function PreviewScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const t = useT(PREVIEW_SCREEN_STRINGS);
  const [state, setState] = useState<State>({ phase: 'building' });
  // The durable link to share is the PUBLISHED url; the preview url is transient.
  const [publishedUrl, setPublishedUrl] = useState<string | null>(null);

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
});
