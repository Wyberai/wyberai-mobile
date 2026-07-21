import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { listVersions, saveFiles, type Version } from '@/lib/api';
import { success, tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

// Version history — every successful build snapshots the full file map to
// /api/versions (see build/[id]). Restore = write that snapshot back as the
// project's current files. Same model as the web editor's History panel.
export default function VersionsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [versions, setVersions] = useState<Version[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setError(null);
    try {
      setVersions(await listVersions(id));
    } catch (e) {
      setError((e as Error).message);
    }
  }, [id]);

  useEffect(() => {
    // Fetch-on-mount: load() sets state only after its own awaits resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load().finally(() => setLoading(false));
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  function restore(v: Version) {
    if (!id || !v.files || restoringId) return;
    tap();
    const count = Object.keys(v.files).length;
    Alert.alert(
      'Restore this version?',
      `Your app goes back to "${v.label}" (${count} files). The current state stays in history, so you can return to it.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Restore',
          onPress: async () => {
            setRestoringId(v.id);
            try {
              await saveFiles(id, v.files!);
              success();
              Alert.alert('Restored ✓', 'Your app is back to this version.', [
                { text: 'Open builder', onPress: () => router.replace(`/build/${id}`) },
                { text: 'Done' },
              ]);
            } catch (e) {
              Alert.alert('Restore failed', (e as Error).message);
            } finally {
              setRestoringId(null);
            }
          },
        },
      ],
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Version history', headerBackTitle: 'Back' }} />
      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          style={styles.list}
          contentContainerStyle={versions.length === 0 ? styles.emptyWrap : styles.listContent}
          data={versions}
          keyExtractor={(v) => v.id}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent} />
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="time-outline" size={40} color={brand.textFaint} />
              <Text style={styles.emptyTitle}>{error ? 'Couldn’t load history' : 'No versions yet'}</Text>
              <Text style={styles.emptyBody}>
                {error ?? 'Every build saves a restorable snapshot here automatically.'}
              </Text>
            </View>
          }
          renderItem={({ item, index }) => (
            <View style={styles.card}>
              <View style={styles.cardTop}>
                <View style={styles.iconWrap}>
                  <Ionicons name="git-commit-outline" size={18} color={brand.accent} />
                </View>
                <View style={styles.cardText}>
                  <Text style={styles.cardLabel} numberOfLines={2}>
                    {item.label}
                  </Text>
                  <Text style={styles.cardMeta}>
                    {index === 0 ? 'Latest · ' : ''}
                    {timeAgo(item.created_at)}
                    {item.files ? ` · ${Object.keys(item.files).length} files` : ''}
                  </Text>
                </View>
              </View>
              <Pressable
                onPress={() => restore(item)}
                disabled={restoringId !== null || !item.files}
                style={({ pressed }) => [styles.restoreBtn, pressed && styles.restoreBtnPressed]}
              >
                {restoringId === item.id ? (
                  <ActivityIndicator color={brand.text} size="small" />
                ) : (
                  <>
                    <Ionicons name="arrow-undo-outline" size={15} color={brand.text} />
                    <Text style={styles.restoreText}>Restore</Text>
                  </>
                )}
              </Pressable>
            </View>
          )}
        />
      )}
    </>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: brand.bg },
  listContent: { padding: space.lg, gap: space.md },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.md,
  },
  cardTop: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardText: { flex: 1, gap: 2 },
  cardLabel: { color: brand.text, fontSize: 14.5, fontWeight: '600', lineHeight: 20 },
  cardMeta: { color: brand.textFaint, fontSize: 12 },
  restoreBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingVertical: space.sm + 2,
    backgroundColor: brand.surfaceAlt,
  },
  restoreBtnPressed: { borderColor: brand.accent },
  restoreText: { color: brand.text, fontSize: 13.5, fontWeight: '600' },
});
