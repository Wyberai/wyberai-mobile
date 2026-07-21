import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import type { AppNotification } from '@/lib/types';
import { useT } from '@/lib/i18n/useT';
import { NOTIFICATIONS_STRINGS } from '@/lib/i18n/dict/notifications';
import { brand, radius, space } from '@/lib/theme';

export default function NotificationsScreen() {
  const t = useT(NOTIFICATIONS_STRINGS);
  const [items, setItems] = useState<AppNotification[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    const { data } = await supabase
      .from('notifications')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(50);
    const rows = (data ?? []) as AppNotification[];
    setItems(rows);
    // Best-effort mark-as-read for anything unread.
    const unread = rows.filter((n) => !n.read).map((n) => n.id);
    if (unread.length) {
      await supabase.from('notifications').update({ read: true }).in('id', unread);
    }
  }, []);

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

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={brand.accent} />
      </View>
    );
  }

  return (
    <FlatList
      style={styles.list}
      contentContainerStyle={items.length === 0 ? styles.emptyWrap : styles.listContent}
      data={items}
      keyExtractor={(n) => n.id}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent} />
      }
      ListEmptyComponent={
        <View style={styles.center}>
          <Ionicons name="notifications-off-outline" size={40} color={brand.textFaint} />
          <Text style={styles.emptyTitle}>{t('allCaughtUp')}</Text>
          <Text style={styles.emptyBody}>{t('emptyBody')}</Text>
        </View>
      }
      renderItem={({ item }) => <NotificationRow n={item} />}
    />
  );
}

function NotificationRow({ n }: { n: AppNotification }) {
  const t = useT(NOTIFICATIONS_STRINGS);
  const { icon, title } = describe(n, t);
  const body = bodyOf(n);
  return (
    <View style={styles.row}>
      <View style={styles.iconWrap}>
        <Ionicons name={icon} size={18} color={brand.accent} />
      </View>
      <View style={styles.rowBody}>
        <Text style={styles.rowTitle}>{title}</Text>
        {body ? <Text style={styles.rowText}>{body}</Text> : null}
        <Text style={styles.rowTime}>{new Date(n.created_at).toLocaleString()}</Text>
      </View>
    </View>
  );
}

function describe(
  n: AppNotification,
  t: ReturnType<typeof useT<typeof NOTIFICATIONS_STRINGS.en>>,
): { icon: keyof typeof Ionicons.glyphMap; title: string } {
  switch (n.type) {
    case 'scheduled_agent_ran':
      return { icon: 'checkmark-circle-outline', title: t('scheduledAgentRan') };
    case 'scheduled_agent_skipped':
      return { icon: 'pause-circle-outline', title: t('scheduledAgentSkipped') };
    case 'build_complete':
      return { icon: 'hammer-outline', title: t('buildComplete') };
    case 'published':
      return { icon: 'rocket-outline', title: t('projectPublished') };
    case 'referral':
      return { icon: 'gift-outline', title: t('referralReward') };
    default:
      return { icon: 'notifications-outline', title: humanize(n.type) };
  }
}

function bodyOf(n: AppNotification): string | null {
  const p = n.payload;
  if (!p) return null;
  const msg = (p as Record<string, unknown>).message ?? (p as Record<string, unknown>).text;
  return typeof msg === 'string' ? msg : null;
}

function humanize(t: string): string {
  return t.replace(/[_-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

const styles = StyleSheet.create({
  list: { flex: 1, backgroundColor: brand.bg },
  listContent: { padding: space.lg, gap: space.sm },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  row: {
    flexDirection: 'row',
    gap: space.md,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  rowBody: { flex: 1, gap: 2 },
  rowTitle: { color: brand.text, fontSize: 15, fontWeight: '600' },
  rowText: { color: brand.textMuted, fontSize: 13, lineHeight: 18 },
  rowTime: { color: brand.textFaint, fontSize: 11, marginTop: 2 },
});
