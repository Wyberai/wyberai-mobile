import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { runSeoScan, type SeoCheck, type SeoReport } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

const STATUS_ICON: Record<SeoCheck['status'], { name: keyof typeof Ionicons.glyphMap; color: string }> = {
  pass: { name: 'checkmark-circle', color: brand.success },
  warn: { name: 'alert-circle', color: '#f59e0b' },
  fail: { name: 'close-circle', color: brand.danger },
};

export default function SeoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<SeoReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const scan = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await runSeoScan(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setStarted(true);
    }
  }, [id]);

  function fixWithAi(check: SeoCheck) {
    if (!id) return;
    tap();
    const prompt = `Fix this SEO issue: ${check.label} — ${check.detail}`;
    router.push(`/build/${id}?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'SEO Check', headerBackTitle: 'Back' }} />
      {!started ? (
        <View style={styles.center}>
          <Ionicons name="search-outline" size={40} color={brand.accent} />
          <Text style={styles.introTitle}>Check your SEO</Text>
          <Text style={styles.introBody}>
            Scans meta tags, Open Graph, structured data, sitemap and robots.txt.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={scan} disabled={loading}>
            {loading ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.primaryText}>Run check</Text>}
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : error ? (
        <View style={styles.center}>
          <Ionicons name="alert-circle-outline" size={36} color={brand.danger} />
          <Text style={styles.introBody}>{error}</Text>
          <Pressable style={styles.primaryBtn} onPress={scan}>
            <Text style={styles.primaryText}>Try again</Text>
          </Pressable>
        </View>
      ) : report ? (
        <FlatList
          contentContainerStyle={styles.list}
          data={report.checks}
          keyExtractor={(c) => c.id}
          ListHeaderComponent={
            <View style={styles.scoreCard}>
              <Text style={styles.scoreValue}>{report.score}</Text>
              <Text style={styles.scoreLabel}>SEO score out of 100</Text>
              <Pressable onPress={scan} hitSlop={8} style={styles.refreshBtn}>
                <Ionicons name="refresh" size={18} color={brand.textMuted} />
              </Pressable>
            </View>
          }
          renderItem={({ item }) => {
            const icon = STATUS_ICON[item.status] ?? STATUS_ICON.warn;
            return (
              <View style={styles.checkRow}>
                <Ionicons name={icon.name} size={20} color={icon.color} />
                <View style={styles.checkText}>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                  <Text style={styles.checkDetail}>{item.detail}</Text>
                </View>
                {item.status !== 'pass' ? (
                  <Pressable onPress={() => fixWithAi(item)} hitSlop={6}>
                    <Ionicons name="sparkles-outline" size={18} color={brand.accent} />
                  </Pressable>
                ) : null}
              </View>
            );
          }}
        />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  introTitle: { color: brand.text, fontSize: 18, fontWeight: '700' },
  introBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, maxWidth: 280 },
  primaryBtn: {
    backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: space.md,
    paddingHorizontal: space.xl, minWidth: 140, alignItems: 'center', marginTop: space.sm,
  },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  list: { padding: space.lg, gap: space.sm },
  scoreCard: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1,
    borderRadius: radius.lg, padding: space.lg, marginBottom: space.sm,
  },
  scoreValue: { color: brand.accent, fontSize: 32, fontWeight: '800' },
  scoreLabel: { flex: 1, color: brand.textMuted, fontSize: 13 },
  refreshBtn: { padding: space.xs },
  checkRow: {
    flexDirection: 'row', alignItems: 'center', gap: space.md,
    backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1,
    borderRadius: radius.md, padding: space.md,
  },
  checkText: { flex: 1, gap: 2 },
  checkLabel: { color: brand.text, fontSize: 14, fontWeight: '600', textTransform: 'capitalize' },
  checkDetail: { color: brand.textFaint, fontSize: 12.5, lineHeight: 17 },
});
