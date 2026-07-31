import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter, useFocusEffect } from 'expo-router';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSession } from '@/ctx/session';
import { FadeInUp, staggerDelay } from '@/components/FadeInUp';
import { SkeletonProjectCard } from '@/components/Skeleton';
import { supabase } from '@/lib/supabase';
import { projectUrl, type Project } from '@/lib/types';
import { useT } from '@/lib/i18n/useT';
import { PROJECTS_STRINGS } from '@/lib/i18n/dict/projects';
import { brand, radius, space } from '@/lib/theme';

const SELECT =
  'id,user_id,name,description,framework,project_type,subdomain,published_url,deployed_url,custom_domain,thumbnail_url,created_at,updated_at';

const FILTER_KEY = 'wyber:projects-filter';
const TYPE_LABEL: Record<string, string> = { web: 'Web', mobile: 'Mobile', website: 'Website', saas: 'SaaS' };

export default function ProjectsScreen() {
  const router = useRouter();
  const t = useT(PROJECTS_STRINGS);
  const { user } = useSession();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string | null>(null); // null = All

  // Restore the last-used filter once — chooseFilter() keeps state and
  // storage in sync from here on, so there's nothing to re-read on refocus.
  useEffect(() => {
    AsyncStorage.getItem(FILTER_KEY).then((v) => {
      if (v) setFilter(v);
    });
  }, []);

  function chooseFilter(next: string | null) {
    setFilter(next);
    AsyncStorage.setItem(FILTER_KEY, next ?? '').catch(() => {});
  }

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
  }, [user]);

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

  // Only offer chips for types the user actually has — no point showing a
  // "SaaS" filter to someone who has only ever built mobile apps.
  const availableTypes = useMemo(
    () => [...new Set(projects.map((p) => p.project_type).filter((t): t is string => !!t))],
    [projects],
  );
  const filteredProjects = useMemo(
    () => (filter ? projects.filter((p) => p.project_type === filter) : projects),
    [projects, filter],
  );

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
      contentContainerStyle={filteredProjects.length === 0 ? styles.emptyWrap : styles.listContent}
      data={filteredProjects}
      keyExtractor={(p) => p.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent} />
      }
      ListHeaderComponent={
        availableTypes.length > 1 ? (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filterRow}>
            <FilterChip label="All" active={filter === null} onPress={() => chooseFilter(null)} />
            {availableTypes.map((type) => (
              <FilterChip
                key={type}
                label={TYPE_LABEL[type] ?? type}
                active={filter === type}
                onPress={() => chooseFilter(type)}
              />
            ))}
          </ScrollView>
        ) : null
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="cube-outline" size={40} color={brand.textFaint} />
          <Text style={styles.emptyTitle}>{filter ? 'No projects of this type' : t('noProjectsYet')}</Text>
          <Text style={styles.emptyBody}>{error ?? t('buildFirstApp')}</Text>
          {!error ? (
            <Pressable
              onPress={() => router.push('/new')}
              style={({ pressed }) => [styles.emptyCta, pressed && styles.emptyCtaPressed]}
            >
              <Ionicons name="sparkles" size={16} color={brand.onAccent} />
              <Text style={styles.emptyCtaText}>{t('newApp')}</Text>
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

function FilterChip({ label, active, onPress }: { label: string; active: boolean; onPress: () => void }) {
  return (
    <Pressable onPress={onPress} style={[styles.chip, active && styles.chipActive]}>
      <Text style={[styles.chipText, active && styles.chipTextActive]}>{label}</Text>
    </Pressable>
  );
}

function ProjectCard({ project, onPress }: { project: Project; onPress: () => void }) {
  const t = useT(PROJECTS_STRINGS);
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
          {project.name || t('untitled')}
        </Text>
        <View style={[styles.badge, live ? styles.badgeLive : styles.badgeDraft]}>
          <Text style={[styles.badgeText, live ? styles.badgeTextLive : styles.badgeTextDraft]}>
            {live ? t('live') : t('draft')}
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
        <Text style={styles.metaText}>{t('updatedPrefix')} {timeAgo(project.updated_at, t)}</Text>
      </View>
    </Pressable>
  );
}

function timeAgo(iso: string, t: ReturnType<typeof useT<typeof PROJECTS_STRINGS.en>>): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return t('justNow');
  if (m < 60) return t('minutesAgo').replace('{n}', String(m));
  const h = Math.floor(m / 60);
  if (h < 24) return t('hoursAgo').replace('{n}', String(h));
  const d = Math.floor(h / 24);
  return t('daysAgo').replace('{n}', String(d));
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: brand.bg },
  filterRow: { flexDirection: 'row', gap: space.sm, paddingHorizontal: space.lg, paddingBottom: space.md },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: space.sm - 2,
    borderRadius: radius.pill,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
  },
  chipActive: { backgroundColor: brand.accent, borderColor: brand.accent },
  chipText: { color: brand.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: brand.onAccent },
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
