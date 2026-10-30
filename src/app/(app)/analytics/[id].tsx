import { useEffect, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { fetchAnalyticsInsights, fetchAnalyticsSummary, type AnalyticsSummary } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

// Analytics — real visitor data for the published app, straight from
// /api/analytics/summary (no tracker, no cookies). Insights are the same
// server-written lines the web panel shows.

const RANGES = [{ label: '7 days', days: 7 }, { label: '30 days', days: 30 }, { label: '90 days', days: 90 }];

export default function AnalyticsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [range, setRange] = useState(7);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [insights, setInsights] = useState<string[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);

  // setState only inside promise callbacks (never synchronously in the effect);
  // range changes flip `loading` from the tap handler instead.
  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    fetchAnalyticsSummary(id, range)
      .then((r) => {
        if (cancelled) return;
        setSummary(r);
        setError(null);
        if (r.pageViews === 0) { setInsights([]); return; }
        setInsightsLoading(true);
        fetchAnalyticsInsights(id, range).then((i) => { if (!cancelled) setInsights(i); }).finally(() => { if (!cancelled) setInsightsLoading(false); });
      })
      .catch((e: Error) => { if (!cancelled) setError(e.message || 'Failed to load analytics'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [id, range]);

  function pickRange(days: number) {
    if (days === range) return;
    setLoading(true);
    setRange(days);
  }

  const maxDaily = summary?.daily.length ? Math.max(...summary.daily.map((d) => d.count)) : 0;

  return (
    <>
      <Stack.Screen options={{ title: 'Analytics' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.lead}>Real visitor data from your published app. No third-party tracker, no cookies.</Text>

        <View style={{ flexDirection: 'row', gap: 6 }}>
          {RANGES.map((r) => (
            <Pressable key={r.days} onPress={() => pickRange(r.days)} style={[styles.pill, range === r.days && styles.pillOn]}>
              <Text style={[styles.pillText, range === r.days && { color: brand.onAccent }]}>{r.label}</Text>
            </Pressable>
          ))}
        </View>

        {loading && <Spinner />}
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {summary && !loading && (
          <>
            <View style={{ flexDirection: 'row', gap: space.sm }}>
              {[
                { label: 'Visitors', value: summary.visitors },
                { label: 'Page views', value: summary.pageViews },
                { label: 'Views/visit', value: summary.viewsPerVisit },
              ].map((m) => (
                <View key={m.label} style={styles.stat}>
                  <Text style={styles.statValue}>{m.value}</Text>
                  <Text style={styles.statLabel}>{m.label}</Text>
                </View>
              ))}
            </View>

            {summary.pageViews > 0 && (insightsLoading || insights.length > 0) ? (
              <View style={styles.insights}>
                <Text style={styles.insightsTitle}>Insights</Text>
                {insightsLoading ? <Text style={styles.row}>Looking at your numbers…</Text> : insights.map((t, i) => <Text key={i} style={styles.insightText}>{t}</Text>)}
              </View>
            ) : null}

            {summary.pageViews === 0 ? (
              <Text style={styles.lead}>No visits recorded in this range yet. The tracking snippet is added on every publish, so counting starts from your next one.</Text>
            ) : (
              <>
                {summary.daily.length > 0 && (
                  <View style={{ gap: space.sm }}>
                    <Text style={styles.sectionTitle}>Daily views</Text>
                    <View style={styles.bars}>
                      {summary.daily.map((d) => (
                        <View key={d.date} style={[styles.bar, { height: `${maxDaily ? (d.count / maxDaily) * 100 : 0}%`, minHeight: d.count > 0 ? 3 : 0 }]} />
                      ))}
                    </View>
                  </View>
                )}
                <List title="Top pages" rows={summary.topPages.map((p) => [p.path, p.count])} />
                <List title="Top sources" rows={summary.topReferrers.map((r) => [r.source, r.count])} />
              </>
            )}
          </>
        )}
      </ScrollView>
    </>
  );
}

function List({ title, rows }: { title: string; rows: [string, number][] }) {
  if (!rows.length) return null;
  return (
    <View style={{ gap: 6 }}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {rows.map(([k, v]) => (
        <View key={k} style={styles.listRow}>
          <Text style={[styles.row, { flex: 1 }]} numberOfLines={1}>{k}</Text>
          <Text style={styles.count}>{v}</Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  lead: { color: brand.textMuted, fontSize: 13, lineHeight: 19 },
  pill: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.sm + 2, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  pillOn: { backgroundColor: brand.accent, borderColor: brand.accent },
  pillText: { color: brand.textMuted, fontSize: 12, fontWeight: '600' },
  error: { color: brand.danger, fontSize: 13 },
  stat: { flex: 1, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  statValue: { color: brand.text, fontSize: 22, fontWeight: '700' },
  statLabel: { color: brand.textMuted, fontSize: 11, marginTop: 2 },
  insights: { gap: 6, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(14,165,233,0.25)', backgroundColor: 'rgba(14,165,233,0.06)' },
  insightsTitle: { color: brand.accent, fontSize: 11, fontWeight: '800', textTransform: 'uppercase', letterSpacing: 0.6 },
  insightText: { color: brand.text, fontSize: 13, lineHeight: 19 },
  sectionTitle: { color: brand.textMuted, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  bars: { flexDirection: 'row', alignItems: 'flex-end', gap: 3, height: 64 },
  bar: { flex: 1, backgroundColor: brand.accent, opacity: 0.85, borderTopLeftRadius: 3, borderTopRightRadius: 3 },
  listRow: { flexDirection: 'row', justifyContent: 'space-between', padding: space.sm, paddingHorizontal: space.md, borderRadius: radius.sm + 2, backgroundColor: brand.surface },
  row: { color: brand.text, fontSize: 13 },
  count: { color: brand.textMuted, fontSize: 13, marginLeft: space.sm },
});
