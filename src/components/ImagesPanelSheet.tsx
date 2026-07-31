import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { regenerateImage } from '@/lib/api';
import { brand, font, radius, space } from '@/lib/theme';
import type { FileMap } from '@/lib/api';

// Mirrors the web editor's ImagesPanel (src/components/editor/ImagesPanel.tsx)
// extraction logic in miniature: every {{wyber-image: prompt | ratio}}
// directive still in source, plus every already-persisted generated-images
// URL, collected across all files. Kept as light regexes here rather than
// importing the web lib (Next.js-only module, not portable to this repo).
const DIRECTIVE_RE = /\{\{\s*wyber-image\s*:\s*([^|}]+?)\s*(?:\|\s*([^}]+?)\s*)?\}\}/gi;
const PERSISTED_URL_RE = /https?:\/\/[^\s"'`)]+\/storage\/v1\/object\/public\/generated-images\/[^\s"'`)]+/g;

type ImageEntry = { key: string; kind: 'directive' | 'persisted'; prompt: string; ratio: string };

function extractEntries(
  files: FileMap,
  // Prompts we learned this session by regenerating a directive into this URL
  // — without this, a persisted URL's prompt is unknowable from file content
  // alone (it's just a URL by then), so Regenerate/Hero-quality would vanish
  // forever the first time an image is regenerated. Backfilling from this map
  // keeps the actions available for anything regenerated in this sheet session.
  knownPrompts: Record<string, { prompt: string; ratio: string }>,
): ImageEntry[] {
  const out: ImageEntry[] = [];
  const seen = new Set<string>();
  for (const f of Object.values(files)) {
    const content = f?.content ?? '';
    for (const m of content.matchAll(DIRECTIVE_RE)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      // No explicit "| ratio" in the directive → matches the web extractor's
      // own default (ratioToSize(undefined) in image-directives.ts): a wide
      // hero shape, not square — most directives are hero/section images.
      out.push({ key: m[0], kind: 'directive', prompt: (m[1] || '').trim(), ratio: (m[2] || '1792x1024').trim() });
    }
    for (const m of content.matchAll(PERSISTED_URL_RE)) {
      if (seen.has(m[0])) continue;
      seen.add(m[0]);
      const known = knownPrompts[m[0]];
      out.push({ key: m[0], kind: 'persisted', prompt: known?.prompt ?? '', ratio: known?.ratio ?? '1792x1024' });
    }
  }
  return out;
}

function replaceTokenInFiles(files: FileMap, token: string, url: string): FileMap {
  const next: FileMap = {};
  for (const [path, f] of Object.entries(files)) {
    next[path] = { ...f, content: (f.content ?? '').split(token).join(url) };
  }
  return next;
}

export function ImagesPanelSheet({
  visible,
  onClose,
  projectId,
  files,
  onFilesChange,
  onCreditsChange,
}: {
  visible: boolean;
  onClose: () => void;
  projectId?: string;
  files: FileMap;
  onFilesChange: (next: FileMap) => void;
  onCreditsChange?: (credits: number) => void;
}) {
  const [knownPrompts, setKnownPrompts] = useState<Record<string, { prompt: string; ratio: string }>>({});
  const entries = useMemo(() => extractEntries(files, knownPrompts), [files, knownPrompts]);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [status, setStatus] = useState<Record<string, string>>({});

  async function regen(entry: ImageEntry, quality?: 'high') {
    if (!projectId || busyKey || !entry.prompt) return;
    setBusyKey(entry.key + (quality ?? ''));
    try {
      const result = await regenerateImage(projectId, entry.prompt, entry.ratio, quality);
      onFilesChange(replaceTokenInFiles(files, entry.key, result.url));
      setKnownPrompts((k) => ({ ...k, [result.url]: { prompt: entry.prompt, ratio: entry.ratio } }));
      if (result.credits !== null) onCreditsChange?.(result.credits);
      setStatus((s) => ({ ...s, [entry.key]: 'Saved' }));
    } catch (e) {
      setStatus((s) => ({ ...s, [entry.key]: (e as Error).message }));
    } finally {
      setBusyKey(null);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Images</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={brand.textMuted} />
          </Pressable>
        </View>
        <ScrollView contentContainerStyle={styles.list}>
          {entries.length === 0 ? (
            <View style={styles.empty}>
              <Ionicons name="image-outline" size={32} color={brand.textFaint} />
              <Text style={styles.emptyText}>No images in this project yet.</Text>
            </View>
          ) : (
            entries.map((entry) => (
              <View key={entry.key} style={styles.card}>
                {entry.kind === 'persisted' ? (
                  <Image source={{ uri: entry.key }} style={styles.thumb} contentFit="cover" />
                ) : (
                  <View style={[styles.thumb, styles.placeholderThumb]}>
                    <Ionicons name="color-wand-outline" size={20} color={brand.textFaint} />
                  </View>
                )}
                <Text style={styles.prompt} numberOfLines={2}>{entry.prompt || 'Uploaded image'}</Text>
                {entry.prompt ? (
                  <View style={styles.actions}>
                    <Pressable
                      style={[
                        styles.actionBtn,
                        busyKey === entry.key && styles.actionBtnBusy,
                        !!busyKey && busyKey !== entry.key && styles.actionBtnDisabled,
                      ]}
                      disabled={!!busyKey}
                      onPress={() => regen(entry)}
                    >
                      {busyKey === entry.key ? (
                        <ActivityIndicator size="small" color={brand.accent} />
                      ) : (
                        <Text style={styles.actionText}>Regenerate (1 cr)</Text>
                      )}
                    </Pressable>
                    <Pressable
                      style={[
                        styles.actionBtn,
                        styles.heroBtn,
                        busyKey === entry.key + 'high' && styles.actionBtnBusy,
                        !!busyKey && busyKey !== entry.key + 'high' && styles.actionBtnDisabled,
                      ]}
                      disabled={!!busyKey}
                      onPress={() => regen(entry, 'high')}
                    >
                      {busyKey === entry.key + 'high' ? (
                        <ActivityIndicator size="small" color="#fff" />
                      ) : (
                        <Text style={styles.heroText}>Hero quality (20 cr)</Text>
                      )}
                    </Pressable>
                  </View>
                ) : null}
                {status[entry.key] ? <Text style={styles.statusText}>{status[entry.key]}</Text> : null}
              </View>
            ))
          )}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brand.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },
  title: { color: brand.text, fontSize: 18, fontFamily: font.display },
  list: { padding: space.lg, gap: space.md },
  empty: { alignItems: 'center', justifyContent: 'center', paddingVertical: space.xxl * 2, gap: space.sm },
  emptyText: { color: brand.textMuted, fontSize: 14 },
  card: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.sm,
  },
  thumb: { width: '100%', height: 140, borderRadius: radius.md, backgroundColor: brand.surfaceAlt },
  placeholderThumb: { alignItems: 'center', justifyContent: 'center' },
  prompt: { color: brand.text, fontSize: 13.5, lineHeight: 19 },
  actions: { flexDirection: 'row', gap: space.sm },
  actionBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: space.sm + 2,
    borderRadius: radius.md,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
  },
  actionBtnBusy: { opacity: 0.7 },
  actionBtnDisabled: { opacity: 0.35 },
  actionText: { color: brand.accent, fontSize: 12.5, fontWeight: '700' },
  heroBtn: { backgroundColor: brand.accent, borderColor: brand.accent },
  heroText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
  statusText: { color: brand.textMuted, fontSize: 11.5 },
});
