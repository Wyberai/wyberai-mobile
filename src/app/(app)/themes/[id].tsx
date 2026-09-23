import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { saveFiles, type FileMap } from '@/lib/api';
import { PALETTES, type Palette } from '@/lib/design-palettes';
import { paletteToTheme, writeAppTheme } from '@/lib/app-theme';
import { tap } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Spinner';
import { useT } from '@/lib/i18n/useT';
import { THEMES_SCREEN_STRINGS } from '@/lib/i18n/dict/themes-screen';
import { brand, radius, space } from '@/lib/theme';

// Themes — the same 30-palette, 0-credit retheme as the web editor. An app's
// look is just the shadcn token block in its src/index.css, so applying a
// palette is a pure string rewrite + save. No LLM, no credits, instant.

// RN's hsl() parser wants "hsl(199, 89%, 48%)" — convert the space-separated
// shadcn channel triplet.
function hslColor(channels: string | undefined): string {
  if (!channels) return 'transparent';
  const m = channels.trim().match(/^([\d.]+)\s+([\d.]+%)\s+([\d.]+%)$/);
  return m ? `hsl(${m[1]}, ${m[2]}, ${m[3]})` : 'transparent';
}

export default function ThemesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT(THEMES_SCREEN_STRINGS);
  const showToast = useToast();
  const [files, setFiles] = useState<FileMap>({});
  const [loading, setLoading] = useState(true);
  const [applyingId, setApplyingId] = useState<string | null>(null);
  const [appliedId, setAppliedId] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    // Wrapped in Promise.resolve() — Supabase's query builder is only a
    // PromiseLike (thenable), whose own .then() doesn't guarantee .catch().
    Promise.resolve(supabase.from('projects').select('files').eq('id', id).maybeSingle())
      .then(({ data }) => {
        setFiles(((data as { files?: FileMap } | null)?.files as FileMap) ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false)); // was missing — a rejected fetch left the theme picker spinning forever
  }, [id]);

  const cssPath = useMemo(
    () => ['src/index.css', 'index.css'].find((p) => files[p] !== undefined) ?? null,
    [files],
  );
  const themeable = Object.keys(files).length >= 2 && cssPath !== null;

  async function apply(pal: Palette) {
    if (!id || !cssPath || applyingId) return;
    tap();
    setApplyingId(pal.id);
    try {
      const nextCss = writeAppTheme(files[cssPath]?.content ?? '', paletteToTheme(pal));
      const updated: FileMap = {
        ...files,
        [cssPath]: { content: nextCss, language: 'css' },
      };
      await saveFiles(id, updated);
      setFiles(updated);
      showToast(t('themeApplied'));
      setAppliedId(pal.id);
      setTimeout(() => setAppliedId((prev) => (prev === pal.id ? null : prev)), 2000);
    } catch (e) {
      Alert.alert(t('couldntApply'), (e as Error).message);
    } finally {
      setApplyingId(null);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('themes') }} />
        <Spinner />
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: t('themes'), headerBackTitle: t('back') }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>
            {t('palettesSummary').replace('{n}', String(PALETTES.length))}
          </Text>
          <View style={styles.freeChip}>
            <Text style={styles.freeChipText}>{t('freeCredits')}</Text>
          </View>
        </View>

        {!themeable ? (
          <View style={styles.center}>
            <Ionicons name="color-palette-outline" size={40} color={brand.textFaint} />
            <Text style={styles.emptyTitle}>{t('noAppYet')}</Text>
            <Text style={styles.emptyBody}>
              {t('noAppYetBody')}
            </Text>
          </View>
        ) : (
          <View style={styles.grid}>
            {PALETTES.map((pal) => {
              const busy = applyingId === pal.id;
              const done = appliedId === pal.id;
              return (
                <Pressable
                  key={pal.id}
                  onPress={() => apply(pal)}
                  disabled={applyingId !== null}
                  style={({ pressed }) => [
                    styles.card,
                    done && styles.cardDone,
                    pressed && styles.cardPressed,
                  ]}
                >
                  {/* Mini mockup painted from the palette's own tokens */}
                  <View style={[styles.mock, { backgroundColor: hslColor(pal.tokens.background) }]}>
                    <View
                      style={[styles.mockTitle, { backgroundColor: hslColor(pal.tokens.foreground) }]}
                    />
                    <View
                      style={[styles.mockBody, { backgroundColor: hslColor(pal.tokens['muted-foreground']) }]}
                    />
                    <View style={styles.mockBtns}>
                      <View style={[styles.mockBtn, { backgroundColor: hslColor(pal.tokens.primary) }]} />
                      <View
                        style={[styles.mockBtn, styles.mockBtnGhost, { backgroundColor: hslColor(pal.tokens.secondary) }]}
                      />
                    </View>
                  </View>
                  <View style={styles.cardFooter}>
                    <Text style={styles.cardLabel} numberOfLines={1}>
                      {busy ? t('applying') : done ? t('applied') : pal.label}
                    </Text>
                    {busy ? (
                      <ActivityIndicator size="small" color={brand.accent} />
                    ) : (
                      <Text style={styles.cardMode}>{pal.mode}</Text>
                    )}
                  </View>
                </Pressable>
              );
            })}
          </View>
        )}

        {themeable ? (
          <Text style={styles.fine}>
            {t('fineprint')}
          </Text>
        ) : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, backgroundColor: brand.bg, minHeight: 300 },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { color: brand.textMuted, fontSize: 13 },
  freeChip: {
    backgroundColor: 'rgba(34,197,94,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(34,197,94,0.3)',
    paddingHorizontal: space.sm + 2,
    paddingVertical: 3,
    borderRadius: radius.pill,
  },
  freeChipText: { color: brand.success, fontSize: 11, fontWeight: '800' },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm + 2 },
  card: {
    width: '48%',
    flexGrow: 1,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.sm + 1,
    gap: space.sm,
  },
  cardDone: { borderColor: brand.accent },
  cardPressed: { backgroundColor: brand.surfaceAlt },
  mock: {
    borderRadius: radius.sm,
    padding: space.sm,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.07)',
  },
  mockTitle: { height: 5, width: '55%', borderRadius: 3, opacity: 0.9 },
  mockBody: { height: 4, width: '80%', borderRadius: 2, opacity: 0.55, marginTop: 4 },
  mockBtns: { flexDirection: 'row', gap: 4, marginTop: 8 },
  mockBtn: { height: 9, width: 26, borderRadius: 3 },
  mockBtnGhost: { borderWidth: 1, borderColor: 'rgba(128,128,128,0.25)' },
  cardFooter: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 4 },
  cardLabel: { color: brand.text, fontSize: 12, fontWeight: '600', flexShrink: 1 },
  cardMode: { color: brand.textFaint, fontSize: 10.5 },
  fine: { color: brand.textFaint, fontSize: 11.5, lineHeight: 17, textAlign: 'center', marginTop: space.sm },
});
