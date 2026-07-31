import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { runSecurityScan, type SecurityFinding, type SecurityScanReport } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

const SEVERITY_COLOR: Record<SecurityFinding['severity'], string> = {
  critical: brand.danger,
  high: '#f59e0b',
  medium: brand.textMuted,
};

function grade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

// A C/D shouldn't read as alarming as an F — three tiers, not a green/red binary.
function gradeColor(score: number): string {
  if (score >= 80) return brand.success;
  if (score >= 60) return '#f59e0b';
  return brand.danger;
}

// Mirrors the web editor's RLS Trust Scanner — same /api/security/rls-scan
// endpoint, surfaced here as a standalone project-detail panel rather than a
// publish-time gate.
export default function SecurityScanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [report, setReport] = useState<SecurityScanReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(false);

  const scan = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    setError(null);
    try {
      setReport(await runSecurityScan(id));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
      setStarted(true);
    }
  }, [id]);

  function sendFixToChat(f: SecurityFinding) {
    if (!id) return;
    tap();
    const prompt = f.fixSql
      ? `Fix this security issue on the "${f.table}" table: ${f.issue}\n\nApply this RLS policy:\n${f.fixSql}`
      : `Fix this security issue on the "${f.table}" table: ${f.issue}`;
    router.push(`/build/${id}?prompt=${encodeURIComponent(prompt)}`);
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Security Scan', headerBackTitle: 'Back' }} />
      {!started ? (
        <View style={styles.center}>
          <Ionicons name="shield-checkmark-outline" size={40} color={brand.accent} />
          <Text style={styles.introTitle}>Scan for data leaks</Text>
          <Text style={styles.introBody}>
            Checks your connected database for tables anyone on the internet could read or write,
            same as the pre-publish scanner.
          </Text>
          <Pressable style={styles.primaryBtn} onPress={scan} disabled={loading}>
            {loading ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.primaryText}>Run scan</Text>}
          </Pressable>
        </View>
      ) : loading ? (
        <View style={styles.center}>
          <Spinner />
          <Text style={styles.introBody}>Scanning your database…</Text>
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
          data={report.findings}
          keyExtractor={(f, i) => `${f.table}-${i}`}
          ListHeaderComponent={
            <View style={styles.scoreCard}>
              <View style={[styles.gradeBadge, { borderColor: gradeColor(report.score) }]}>
                <Text style={[styles.gradeText, { color: gradeColor(report.score) }]}>
                  {grade(report.score)}
                </Text>
              </View>
              <View style={styles.scoreText}>
                <Text style={styles.scoreTitle}>Score: {report.score}/100</Text>
                <Text style={styles.scoreSub}>
                  {report.tablesScanned} table{report.tablesScanned === 1 ? '' : 's'} scanned ·{' '}
                  {report.findings.length === 0 ? 'no issues found' : `${report.findings.length} finding${report.findings.length === 1 ? '' : 's'}`}
                </Text>
              </View>
              <Pressable onPress={scan} hitSlop={8}>
                <Ionicons name="refresh" size={20} color={brand.textMuted} />
              </Pressable>
            </View>
          }
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="checkmark-circle-outline" size={40} color={brand.success} />
              <Text style={styles.introBody}>No exposed tables found. Nice.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.findingCard}>
              <View style={styles.findingTop}>
                <View style={[styles.sevDot, { backgroundColor: SEVERITY_COLOR[item.severity] }]} />
                <Text style={styles.findingTable}>{item.table}</Text>
                <Text style={[styles.sevLabel, { color: SEVERITY_COLOR[item.severity] }]}>
                  {item.severity.toUpperCase()}
                </Text>
              </View>
              <Text style={styles.findingIssue}>{item.issue}</Text>
              {item.evidence ? <Text style={styles.findingEvidence}>{item.evidence}</Text> : null}
              <Pressable
                style={({ pressed }) => [styles.fixBtn, pressed && styles.fixBtnPressed]}
                onPress={() => sendFixToChat(item)}
              >
                <Ionicons name="sparkles-outline" size={15} color={brand.accent} />
                <Text style={styles.fixText}>Send fix to chat</Text>
              </Pressable>
            </View>
          )}
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
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xl,
    minWidth: 140,
    alignItems: 'center',
    marginTop: space.sm,
  },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  list: { padding: space.lg, gap: space.md },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    marginBottom: space.sm,
  },
  gradeBadge: {
    width: 44,
    height: 44,
    borderRadius: radius.pill,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  gradeText: { fontSize: 18, fontWeight: '800' },
  scoreText: { flex: 1, gap: 2 },
  scoreTitle: { color: brand.text, fontSize: 15, fontWeight: '700' },
  scoreSub: { color: brand.textFaint, fontSize: 12.5 },
  findingCard: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
    gap: space.xs,
  },
  findingTop: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  sevDot: { width: 8, height: 8, borderRadius: 4 },
  findingTable: { flex: 1, color: brand.text, fontSize: 14, fontWeight: '700' },
  sevLabel: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  findingIssue: { color: brand.text, fontSize: 13.5, lineHeight: 19 },
  findingEvidence: { color: brand.textFaint, fontSize: 12, fontFamily: 'monospace' },
  fixBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    alignSelf: 'flex-start',
    marginTop: space.xs,
    paddingVertical: space.xs,
    paddingHorizontal: space.sm,
    borderRadius: radius.sm,
    backgroundColor: 'rgba(14,165,233,0.1)',
  },
  fixBtnPressed: { backgroundColor: 'rgba(14,165,233,0.18)' },
  fixText: { color: brand.accent, fontSize: 12.5, fontWeight: '700' },
});
