import { useCallback, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/ctx/session';
import { FadeInUp, staggerDelay } from '@/components/FadeInUp';
import { SkeletonProjectCard } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { projectUrl, type Project } from '@/lib/types';
import { brand, radius, space } from '@/lib/theme';

const SELECT =
  'id,user_id,name,description,framework,subdomain,published_url,deployed_url,custom_domain,thumbnail_url,created_at,updated_at';

export default function ProjectsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError(null);
    // MUST filter by user_id: RLS also returns public projects, so without this
    // the list would show other users' published apps mixed in with yours.
    const { data, error } = await supabase
      .from('projects')
      .select(SELECT)
      .eq('user_id', user.id)
      .order('updated_at', { ascending: false });
    if (error) setError(error.message);
    else setProjects((data ?? []) as Project[]);
  }, [user?.id]);

  // Refetch every time the Projects tab regains focus — this tab never unmounts,
  // so a mount-only effect left the list stale after creating a project (the user
  // had to pull-to-refresh). useFocusEffect fires on first mount AND on every
  // return to the tab, so a newly-built app now appears automatically.
  useFocusEffect(
    useCallback(() => {
      load().finally(() => setLoading(false));
    }, [load]),
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  }, [load]);

  if (loading) {
    return (
      <View style={styles.listContent}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonProjectCard key={i} />
        ))}
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={projects.length === 0 ? styles.emptyWrap : styles.listContent}
      data={projects}
      keyExtractor={(p) => p.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent} />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={40} color={brand.textFaint} />
          <Text style={styles.emptyTitle}>No projects yet</Text>
          <Text style={styles.emptyBody}>{error ?? 'Build your first app right here on your phone.'}</Text>
          {!error ? (
            <Pressable
              onPress={() => router.push('/new')}
              style={({ pressed }) => [styles.emptyCta, pressed && styles.emptyCtaPressed]}
            >
              <Ionicons name="sparkles" size={16} color={brand.onAccent} />
              <Text style={styles.emptyCtaText}>New app</Text>
            </Pressable>
          ) : null}
        </View>
      }
      renderItem={({ item, index }) => (
        <FadeInUp delay={staggerDelay(index)}>
          <ProjectCard project={item} onPress={() => router.push(`/project/${item.id}`)} />
        </FadeInUp>
      )}
    />
  );
}

function ProjectCard({ project, onPress }: { project: Project; onPress: () => void }) {
  const live = projectUrl(project);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
    >
      {project.thumbnail_url ? (
        <Image
          source={{ uri: project.thumbnail_url }}
          style={styles.cardThumb}
          contentFit="cover"
          transition={150}
        />
      ) : null}
      <View style={styles.cardHeader}>
        <Text style={styles.cardTitle} numberOfLines={1}>
          {project.name || 'Untitled'}
        </Text>
        <View style={[styles.badge, live ? styles.badgeLive : styles.badgeDraft]}>
          <Text style={[styles.badgeText, live ? styles.badgeTextLive : styles.badgeTextDraft]}>
            {live ? 'Live' : 'Draft'}
          </Text>
        </View>
      </View>
      {project.description ? (
        <Text style={styles.cardDesc} numberOfLines={2}>
          {project.description}
        </Text>
      ) : null}
      <View style={styles.cardMeta}>
        <Text style={styles.metaText}>{project.framework}</Text>
        <Text style={styles.metaDot}>·</Text>
        <Text style={styles.metaText}>Updated {timeAgo(project.updated_at)}</Text>
      </View>
    </Pressable>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: brand.bg },
  listContent: { padding: space.lg, gap: space.md },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyCta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: brand.accent,
    paddingHorizontal: space.xl,
    paddingVertical: space.md,
    borderRadius: radius.pill,
    marginTop: space.md,
  },
  emptyCtaPressed: { backgroundColor: brand.accentDim, transform: [{ scale: 0.95 }] },
  emptyCtaText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  card: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  cardPressed: { backgroundColor: brand.surfaceAlt, transform: [{ scale: 0.95 }] },
  cardThumb: {
    width: '100%',
    height: 120,
    borderRadius: radius.md,
    backgroundColor: brand.surfaceAlt,
    marginBottom: space.xs,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { color: brand.text, fontSize: 17, fontWeight: '700', flex: 1 },
  cardDesc: { color: brand.textMuted, fontSize: 14, lineHeight: 19 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  metaText: { color: brand.textFaint, fontSize: 12 },
  metaDot: { color: brand.textFaint, fontSize: 12 },
  badge: { paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeLive: { backgroundColor: 'rgba(34,197,94,0.15)' },
  badgeDraft: { backgroundColor: brand.surfaceAlt },
  badgeText: { fontSize: 11, fontWeight: '700' },
  badgeTextLive: { color: brand.success },
  badgeTextDraft: { color: brand.textFaint },
});
