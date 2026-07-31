import { useCallback, useEffect, useState } from 'react';
import { FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE, fetchCloudDatabase, fetchCloudTables, type CloudDatabase, type CloudTable } from '@/lib/api';
import { useToast } from '@/components/Toast';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

const STATUS_COLOR: Record<CloudDatabase['status'], string> = {
  ready: brand.success,
  provisioning: '#f59e0b',
  deleting: brand.textMuted,
  deleted: brand.textFaint,
  failed: brand.danger,
};

export default function DatabaseStatusScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useToast();
  const [db, setDb] = useState<CloudDatabase | null>(null);
  const [tables, setTables] = useState<CloudTable[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!id) return;
    const [database, tableData] = await Promise.all([fetchCloudDatabase(id), fetchCloudTables(id)]);
    setDb(database);
    setTables(tableData.tables);
    setLoading(false);
  }, [id]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  function copyHost() {
    if (!db || !db.db_host || !db.db_port) return;
    tap();
    Clipboard.setStringAsync(`${db.db_host}:${db.db_port}`);
    showToast('Copied', 'success');
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Database', headerBackTitle: 'Back' }} />
      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : !db ? (
        <View style={styles.center}>
          <Ionicons name="server-outline" size={40} color={brand.textFaint} />
          <Text style={styles.emptyTitle}>No database yet</Text>
          <Text style={styles.emptyBody}>
            Ask the builder to add a database and one will be provisioned automatically.
          </Text>
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={tables}
          keyExtractor={(t) => `${t.schema}.${t.name}`}
          ListHeaderComponent={
            <>
              <View style={styles.statusCard}>
                <View style={styles.statusRow}>
                  <View style={[styles.statusDot, { backgroundColor: STATUS_COLOR[db.status] }]} />
                  <Text style={styles.statusLabel}>{db.status}</Text>
                  {db.db_tier ? <Text style={styles.tierBadge}>{db.db_tier}</Text> : null}
                </View>
                {db.status_message ? <Text style={styles.statusMessage}>{db.status_message}</Text> : null}
                {db.db_host && db.db_port ? (
                  <Pressable style={styles.hostRow} onPress={copyHost} hitSlop={6}>
                    <Text style={styles.hostText} numberOfLines={1}>
                      {db.db_host}:{db.db_port}
                    </Text>
                    <Ionicons name="copy-outline" size={15} color={brand.textMuted} />
                  </Pressable>
                ) : (
                  <Text style={styles.metaText}>Connection details appear once provisioning finishes.</Text>
                )}
                {db.region ? <Text style={styles.metaText}>{db.region} · {db.db_name}</Text> : null}
              </View>
              <Text style={styles.sectionLabel}>{tables.length} table{tables.length === 1 ? '' : 's'}</Text>
            </>
          }
          ListFooterComponent={
            <Pressable
              style={styles.dashboardLink}
              onPress={() => WebBrowser.openBrowserAsync(`${API_BASE}/project/${id}`).catch(() => {})}
            >
              <Ionicons name="open-outline" size={16} color={brand.accent} />
              <Text style={styles.dashboardLinkText}>Manage database in web editor</Text>
            </Pressable>
          }
          ListEmptyComponent={
            <Text style={styles.emptyBody}>No tables yet.</Text>
          }
          renderItem={({ item }) => (
            <View style={styles.tableRow}>
              <Ionicons name="grid-outline" size={16} color={brand.textMuted} />
              <Text style={styles.tableName} numberOfLines={1}>{item.name}</Text>
              <Text style={styles.tableCount}>{item.rowCount ?? '—'}</Text>
            </View>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyTitle: { color: brand.text, fontSize: 17, fontWeight: '700' },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  list: { padding: space.lg, gap: space.sm },
  statusCard: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
    marginBottom: space.md,
  },
  statusRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  statusDot: { width: 9, height: 9, borderRadius: 5 },
  statusLabel: { color: brand.text, fontSize: 15, fontWeight: '700', textTransform: 'capitalize', flex: 1 },
  tierBadge: {
    color: brand.textMuted,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: 2,
    textTransform: 'uppercase',
  },
  statusMessage: { color: brand.textMuted, fontSize: 13 },
  hostRow: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  hostText: { color: brand.textMuted, fontSize: 12.5, fontFamily: 'monospace', flexShrink: 1 },
  metaText: { color: brand.textFaint, fontSize: 12 },
  sectionLabel: {
    color: brand.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: space.xs,
  },
  tableRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
  },
  tableName: { flex: 1, color: brand.text, fontSize: 13.5, fontWeight: '600' },
  tableCount: { color: brand.textFaint, fontSize: 12.5 },
  dashboardLink: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: space.md,
    marginTop: space.sm,
  },
  dashboardLinkText: { color: brand.accent, fontSize: 13.5, fontWeight: '600' },
});
