import { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { fetchPreviewStats, type PreviewStats } from '@/lib/api';
import { brand, font, radius, space } from '@/lib/theme';

// Makes the preview-access credit model (2cr app / 5cr game per viewer/day —
// /api/preview-access) transparent to the builder: how often the QR/deep
// link gets scanned, by how many distinct people, and what it's cost this
// month. Silently renders nothing if there's no activity yet or the fetch
// fails — this is a nice-to-have panel, never worth an error state.
export function PreviewActivityCard({ projectId }: { projectId: string }) {
  const [stats, setStats] = useState<PreviewStats | null>(null);

  useEffect(() => {
    fetchPreviewStats(projectId).then(setStats);
  }, [projectId]);

  if (!stats || (stats.opensThisWeek === 0 && stats.creditsChargedThisMonth === 0)) return null;

  const maxCount = Math.max(1, ...stats.daily.map((d) => d.count));

  return (
    <View style={styles.card}>
      <Text style={styles.title}>Preview activity</Text>
      <View style={styles.statRow}>
        <Stat label="Opens this week" value={String(stats.opensThisWeek)} />
        <Stat label="Unique viewers" value={String(stats.uniqueViewers)} />
        <Stat label="Credits this month" value={String(stats.creditsChargedThisMonth)} />
      </View>
      <View style={styles.sparkline}>
        {stats.daily.map((d) => (
          <View key={d.date} style={styles.barWrap}>
            <View
              style={[
                styles.bar,
                { height: Math.max(3, (d.count / maxCount) * 36) },
              ]}
            />
          </View>
        ))}
      </View>
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
  },
  title: { color: brand.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  statRow: { flexDirection: 'row', gap: space.md },
  stat: { flex: 1, gap: 2 },
  statValue: { color: brand.text, fontSize: 20, fontFamily: font.display },
  statLabel: { color: brand.textFaint, fontSize: 11 },
  sparkline: { flexDirection: 'row', alignItems: 'flex-end', gap: 4, height: 36 },
  barWrap: { flex: 1, alignItems: 'center', justifyContent: 'flex-end', height: 36 },
  bar: { width: '100%', borderRadius: 2, backgroundColor: brand.accent },
});
