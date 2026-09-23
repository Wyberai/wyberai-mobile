import { useEffect, useMemo, useState } from 'react';
import {
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import type { FileMap } from '@/lib/api';
import { useT } from '@/lib/i18n/useT';
import { CODE_SCREEN_STRINGS } from '@/lib/i18n/dict/code-screen';
import { brand, radius, space } from '@/lib/theme';

// Read-only code browser — see exactly what the AI wrote (Lovable's code view).
// Files are grouped by top-level folder; tapping one opens it inline with line
// numbers. Editing stays in chat where the model can keep the app consistent.

type Node = { dir: string; files: { path: string; name: string; size: number }[] };

function groupFiles(files: FileMap): Node[] {
  const dirs = new Map<string, Node>();
  for (const [path, f] of Object.entries(files)) {
    const parts = path.split('/');
    const dir = parts.length > 1 ? parts.slice(0, -1).join('/') : '/';
    if (!dirs.has(dir)) dirs.set(dir, { dir, files: [] });
    dirs.get(dir)!.files.push({ path, name: parts[parts.length - 1], size: f.content?.length ?? 0 });
  }
  return [...dirs.values()]
    .sort((a, b) => a.dir.localeCompare(b.dir))
    .map((n) => ({ ...n, files: n.files.sort((a, b) => a.name.localeCompare(b.name)) }));
}

function fileIcon(name: string): keyof typeof Ionicons.glyphMap {
  if (/\.(tsx|jsx)$/.test(name)) return 'logo-react';
  if (/\.(ts|js)$/.test(name)) return 'code-slash-outline';
  if (/\.css$/.test(name)) return 'color-fill-outline';
  if (/\.json$/.test(name)) return 'settings-outline';
  if (/\.html$/.test(name)) return 'globe-outline';
  return 'document-text-outline';
}

function prettySize(n: number): string {
  return n < 1024 ? `${n} B` : `${(n / 1024).toFixed(1)} KB`;
}

export default function CodeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useT(CODE_SCREEN_STRINGS);
  const [files, setFiles] = useState<FileMap>({});
  const [loading, setLoading] = useState(true);
  const [openPath, setOpenPath] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    // Wrapped in Promise.resolve() — Supabase's query builder is only a
    // PromiseLike (thenable), whose own .then() doesn't guarantee .catch().
    Promise.resolve(supabase.from('projects').select('files').eq('id', id).maybeSingle())
      .then(({ data }) => {
        setFiles(((data as { files?: FileMap } | null)?.files as FileMap) ?? {});
        setLoading(false);
      })
      .catch(() => setLoading(false)); // was missing — a rejected fetch left this screen spinning forever
  }, [id]);

  const tree = useMemo(() => groupFiles(files), [files]);
  const open = openPath ? files[openPath] : null;
  const totalFiles = Object.keys(files).length;

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: t('code') }} />
        <Spinner />
      </View>
    );
  }

  // ── File open: content view with line numbers ──
  if (open && openPath) {
    const lines = open.content.split('\n');
    return (
      <>
        <Stack.Screen
          options={{
            title: openPath.split('/').pop(),
            headerBackTitle: t('files'),
            headerLeft: () => (
              <Pressable onPress={() => setOpenPath(null)} hitSlop={10} style={{ paddingRight: 10 }}>
                <Ionicons name="chevron-back" size={24} color={brand.accent} />
              </Pressable>
            ),
          }}
        />
        <View style={styles.fileHeader}>
          <Ionicons name={fileIcon(openPath)} size={14} color={brand.accent} />
          <Text style={styles.fileHeaderPath} numberOfLines={1}>
            {openPath}
          </Text>
          <Text style={styles.fileHeaderMeta}>
            {t('linesAndSize').replace('{n}', String(lines.length)).replace('{size}', prettySize(open.content.length))}
          </Text>
        </View>
        <ScrollView style={styles.codeScroll}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.codeBlock}>
              {lines.map((line, i) => (
                <View key={i} style={styles.codeLine}>
                  <Text style={styles.lineNum}>{i + 1}</Text>
                  <Text style={styles.lineText}>{line || ' '}</Text>
                </View>
              ))}
            </View>
          </ScrollView>
          <View style={{ height: space.xxl }} />
        </ScrollView>
      </>
    );
  }

  // ── File tree ──
  return (
    <>
      <Stack.Screen options={{ title: t('code'), headerBackTitle: t('back') }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {totalFiles === 0 ? (
          <View style={styles.center}>
            <Ionicons name="code-slash-outline" size={40} color={brand.textFaint} />
            <Text style={styles.emptyTitle}>{t('noCodeYet')}</Text>
            <Text style={styles.emptyBody}>{t('buildFirstBody')}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.summary}>
              {t('filesSummary').replace('{n}', String(totalFiles))}
            </Text>
            {tree.map((node) => (
              <View key={node.dir} style={styles.dirCard}>
                <View style={styles.dirHeader}>
                  <Ionicons name="folder-open-outline" size={15} color={brand.textMuted} />
                  <Text style={styles.dirName}>{node.dir === '/' ? t('root') : node.dir}</Text>
                  <Text style={styles.dirCount}>{node.files.length}</Text>
                </View>
                {node.files.map((f, i) => (
                  <View key={f.path}>
                    {i > 0 ? <View style={styles.divider} /> : null}
                    <Pressable
                      onPress={() => {
                        tap();
                        setOpenPath(f.path);
                      }}
                      style={({ pressed }) => [styles.fileRow, pressed && styles.fileRowPressed]}
                    >
                      <Ionicons name={fileIcon(f.name)} size={16} color={brand.accent} />
                      <Text style={styles.fileName} numberOfLines={1}>
                        {f.name}
                      </Text>
                      <Text style={styles.fileSize}>{prettySize(f.size)}</Text>
                      <Ionicons name="chevron-forward" size={15} color={brand.textFaint} />
                    </Pressable>
                  </View>
                ))}
              </View>
            ))}
          </>
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, backgroundColor: brand.bg, minHeight: 400 },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  summary: { color: brand.textFaint, fontSize: 12.5, marginBottom: space.xs },
  dirCard: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  dirHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    backgroundColor: brand.surfaceAlt,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },
  dirName: { color: brand.textMuted, fontSize: 12.5, fontWeight: '700', flex: 1 },
  dirCount: { color: brand.textFaint, fontSize: 11.5 },
  fileRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingVertical: space.md },
  fileRowPressed: { backgroundColor: brand.surfaceAlt },
  fileName: { color: brand.text, fontSize: 14, flex: 1, fontWeight: '500' },
  fileSize: { color: brand.textFaint, fontSize: 11.5 },
  divider: { height: 1, backgroundColor: brand.border, marginLeft: space.md + 16 + space.sm },
  fileHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    backgroundColor: brand.surface,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },
  fileHeaderPath: { color: brand.textMuted, fontSize: 12, flex: 1 },
  fileHeaderMeta: { color: brand.textFaint, fontSize: 11 },
  codeScroll: { flex: 1, backgroundColor: brand.bg },
  codeBlock: { paddingVertical: space.sm, paddingRight: space.xl, minWidth: '100%' },
  codeLine: { flexDirection: 'row' },
  lineNum: {
    color: brand.textFaint,
    fontSize: 11.5,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    width: 44,
    textAlign: 'right',
    paddingRight: space.sm,
    lineHeight: 18,
  },
  lineText: {
    color: brand.text,
    fontSize: 12,
    fontFamily: Platform.select({ ios: 'Menlo', default: 'monospace' }),
    lineHeight: 18,
  },
});
