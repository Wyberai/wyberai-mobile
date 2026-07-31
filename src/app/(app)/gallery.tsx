import { useCallback, useState } from 'react';
import { FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { fetchGallery, voteGalleryEntry, type GalleryEntry } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, font, radius, space } from '@/lib/theme';

export default function GalleryScreen() {
  const [entries, setEntries] = useState<GalleryEntry[]>([]);
  const [votedIds, setVotedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [votingId, setVotingId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchGallery().then(({ entries: e, votedIds: v }) => {
      setEntries(e);
      setVotedIds(new Set(v));
      setLoading(false);
    });
  }, []);

  useFocusEffect(load);

  async function onRefresh() {
    setRefreshing(true);
    await new Promise<void>((resolve) => {
      fetchGallery().then(({ entries: e, votedIds: v }) => {
        setEntries(e);
        setVotedIds(new Set(v));
        resolve();
      });
    });
    setRefreshing(false);
  }

  async function onVote(entry: GalleryEntry) {
    if (votingId) return;
    tap();
    setVotingId(entry.id);
    // /api/challenge/vote TOGGLES — a second tap by the same voter un-votes.
    // Bump or un-bump the optimistic count based on the CURRENT voted state,
    // not always +1, so a second tap doesn't visibly overshoot before snapping
    // back down once the real count arrives.
    const wasVoted = votedIds.has(entry.id);
    setEntries((prev) =>
      prev.map((e) => (e.id === entry.id ? { ...e, vote_count: e.vote_count + (wasVoted ? -1 : 1) } : e)),
    );
    setVotedIds((prev) => {
      const next = new Set(prev);
      if (wasVoted) next.delete(entry.id);
      else next.add(entry.id);
      return next;
    });
    try {
      const result = await voteGalleryEntry(entry.id);
      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, vote_count: result.count } : e)),
      );
      setVotedIds((prev) => {
        const next = new Set(prev);
        if (result.voted) next.add(entry.id);
        else next.delete(entry.id);
        return next;
      });
    } catch {
      load();
    } finally {
      setVotingId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Community Gallery', headerBackTitle: 'Back' }} />
      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={entries.length === 0 ? styles.emptyWrap : styles.list}
          data={entries}
          keyExtractor={(e) => e.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="globe-outline" size={36} color={brand.textFaint} />
              <Text style={styles.emptyText}>No builds shared this week yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => WebBrowser.openBrowserAsync(item.live_url).catch(() => {})}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              {item.thumbnail_url ? (
                <Image source={{ uri: item.thumbnail_url }} style={styles.thumb} contentFit="cover" transition={150} />
              ) : (
                <View style={[styles.thumb, styles.thumbEmpty]}>
                  <Ionicons name="globe-outline" size={26} color={brand.textFaint} />
                </View>
              )}
              <View style={styles.cardBody}>
                <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
                {item.description ? (
                  <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
                ) : null}
                <View style={styles.footer}>
                  {item.handle ? (
                    <Text style={styles.handle} numberOfLines={1}>@{item.handle.replace(/^@/, '')}</Text>
                  ) : (
                    <View />
                  )}
                  <Pressable onPress={() => onVote(item)} disabled={votingId === item.id} style={styles.voteBtn} hitSlop={8}>
                    <Ionicons
                      name={votedIds.has(item.id) ? 'arrow-up-circle' : 'arrow-up'}
                      size={13}
                      color={brand.accent}
                    />
                    <Text style={[styles.voteText, votedIds.has(item.id) && styles.voteTextActive]}>
                      {item.vote_count}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: brand.textMuted, fontSize: 14, textAlign: 'center' },
  list: { padding: space.lg, gap: space.md },
  card: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.sm,
    overflow: 'hidden',
  },
  cardPressed: { borderColor: brand.accent },
  thumb: { width: 88, height: 88, borderRadius: radius.md, backgroundColor: brand.surfaceAlt },
  thumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  cardBody: { flex: 1, gap: 3, justifyContent: 'center' },
  title: { color: brand.text, fontSize: 15, fontFamily: font.display },
  description: { color: brand.textMuted, fontSize: 12.5, lineHeight: 17 },
  footer: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 4 },
  handle: { color: brand.textFaint, fontSize: 12, flexShrink: 1 },
  voteBtn: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  voteText: { color: brand.accent, fontSize: 12.5, fontWeight: '700' },
  voteTextActive: { textDecorationLine: 'underline' },
});
