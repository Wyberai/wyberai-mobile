import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchLaunchChecklist,
  fetchLaunchReadinessHistory,
  isLaunchReady,
  runLaunchReadiness,
  saveLaunchChecklist,
  type ReadinessReport,
  type ReadinessScan,
} from '@/lib/api';
import { CHECKLIST_ITEMS, checklistProgress, type ChecklistState } from '@/lib/launch-checklist';
import { tap } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// Mirrors the web editor's Security tab sections "Launch readiness" (automated
// scan of the app's own source, advisory only) and "Founder checklist" (the
// human-judgment half, self-certified). Same endpoints as web.

const SEV_COLOR: Record<'critical' | 'high' | 'medium', string> = {
  critical: brand.danger,
  high: '#f59e0b',
  medium: brand.textMuted,
};
const scoreColor = (s: number) => (s >= 85 ? brand.success : s >= 50 ? '#f59e0b' : brand.danger);

export default function LaunchReadinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [report, setReport] = useState<ReadinessReport | null>(null);
  const [history, setHistory] = useState<ReadinessScan[]>([]);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [saveNote, setSaveNote] = useState('');
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const loaded = useRef(false);

  const loadHistory = useCallback(() => {
    if (id) fetchLaunchReadinessHistory(id).then(setHistory);
  }, [id]);

  useEffect(() => {
    if (!id) return;
    loadHistory();
    fetchLaunchChecklist(id).then((s) => {
      setChecklist(s);
      loaded.current = true;
    });
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, [id, loadHistory]);

  async function scan() {
    if (!id || scanning) return;
    tap();
    setScanning(true);
    setError(null);
    setReport(null);
    try {
      setReport(await runLaunchReadiness(id));
      loadHistory();
    } catch (e) {
      setError((e as Error).message);
    }
    setScanning(false);
  }

  // Debounced autosave, same behavior as web's FounderChecklistPanel. Never
  // saves before the server copy has loaded (would overwrite it with empty).
  function update(next: ChecklistState) {
    setChecklist(next);
    if (!id || !loaded.current) return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveNote('');
    saveTimer.current = setTimeout(() => {
      saveLaunchChecklist(id, next)
        .then(() => setSaveNote('Saved'))
        .catch(() => setSaveNote("Couldn't save"));
    }, 600);
  }

  const findings = (report?.checks ?? []).filter((c) => c.severity !== 'good');
  const passed = (report?.checks ?? []).filter((c) => c.severity === 'good');
  const ready = !!report && isLaunchReady(report);
  const progress = checklistProgress(checklist);

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Launch readiness', headerBackTitle: 'Back' }} />

      <Text style={styles.h}>Launch readiness</Text>
      <Text style={styles.body}>
        Checks the source of your app for legal pages, contact info, placeholder content and broken links. Advisory only,
        it never blocks publishing.
      </Text>
      <Pressable style={[styles.primaryBtn, scanning && styles.dim]} onPress={scan} disabled={scanning}>
        {scanning ? <ActivityIndicator color={brand.onAccent} /> : <Ionicons name="rocket-outline" size={16} color={brand.onAccent} />}
        <Text style={styles.primaryText}>{scanning ? 'Checking your app…' : 'Run launch scan'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {report ? (
        <>
          <View style={styles.scoreCard}>
            <Text style={[styles.score, { color: scoreColor(report.score) }]}>{report.score}</Text>
            <View style={styles.flex}>
              <Text style={styles.scoreTitle}>Launch readiness score</Text>
              <Text style={styles.scoreSub}>
                {findings.length} issue{findings.length === 1 ? '' : 's'} · {passed.length}/{report.total} passed
              </Text>
            </View>
            <Text style={[styles.badge, ready ? styles.badgeOk : styles.badgeOff]}>
              {ready ? 'Ready to launch' : 'Not ready yet'}
            </Text>
          </View>
          {findings.map((f, i) => {
            const color = SEV_COLOR[f.severity as 'critical' | 'high' | 'medium'];
            return (
              <View key={`${f.id}-${i}`} style={[styles.finding, { borderColor: color + '66' }]}>
                <Text style={[styles.sev, { color }]}>
                  {f.severity.toUpperCase()} · {f.label}
                </Text>
                <Text style={styles.detail}>{f.detail}</Text>
                {f.fix ? <Text style={styles.fix}>Fix: {f.fix}</Text> : null}
              </View>
            );
          })}
          {passed.length > 0 ? (
            <View style={styles.passedWrap}>
              {passed.map((c, i) => (
                <Text key={`${c.id}-${i}`} style={styles.passedChip}>
                  ✓ {c.label}
                </Text>
              ))}
            </View>
          ) : null}
        </>
      ) : null}

      {history.length > 0 ? (
        <View style={styles.historyWrap}>
          <Text style={styles.sub}>Scan history</Text>
          {history.map((h) => (
            <View key={h.id} style={styles.historyRow}>
              <Text style={[styles.historyScore, { color: scoreColor(h.score) }]}>
                {h.score}
                {h.critical_count > 0 ? <Text style={{ color: brand.danger }}> · {h.critical_count} critical</Text> : null}
              </Text>
              <Text style={styles.historyDate}>{new Date(h.created_at).toLocaleString()}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.divider} />

      <Text style={styles.h}>Founder checklist</Text>
      <Text style={styles.body}>
        The decisions no scanner can check: pricing, positioning, support, channel, success metric and legal entity. You
        self-certify these. {progress.done}/{progress.total} done{saveNote ? ` · ${saveNote}` : ''}
      </Text>
      {CHECKLIST_ITEMS.map((item) => {
        const st = checklist[item.id];
        return (
          <View key={item.id} style={styles.item}>
            <View style={styles.itemTop}>
              <View style={styles.flex}>
                <Text style={styles.itemLabel}>{item.label}</Text>
                <Text style={styles.itemHelper}>{item.helper}</Text>
              </View>
              <Switch
                value={!!st?.checked}
                onValueChange={(v) => update({ ...checklist, [item.id]: { ...st, checked: v } })}
                trackColor={{ true: brand.success }}
              />
            </View>
            {item.notePrompt ? (
              <TextInput
                style={styles.input}
                placeholder={item.notePrompt}
                placeholderTextColor={brand.textFaint}
                value={st?.note ?? ''}
                maxLength={280}
                onChangeText={(v) => update({ ...checklist, [item.id]: { checked: !!st?.checked, note: v } })}
              />
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  h: { color: brand.text, fontSize: 18, fontWeight: '700' },
  sub: { color: brand.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  body: { color: brand.textMuted, fontSize: 13.5, lineHeight: 19 },
  primaryBtn: {
    flexDirection: 'row',
    gap: 8,
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dim: { opacity: 0.7 },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  error: { color: brand.danger, fontSize: 13, lineHeight: 18 },
  scoreCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.md,
  },
  score: { fontSize: 34, fontWeight: '800' },
  scoreTitle: { color: brand.text, fontSize: 14, fontWeight: '700' },
  scoreSub: { color: brand.textFaint, fontSize: 12, marginTop: 2 },
  badge: { fontSize: 11, fontWeight: '700', paddingHorizontal: 8, paddingVertical: 3, borderRadius: 999, overflow: 'hidden' },
  badgeOk: { color: brand.success, backgroundColor: brand.success + '1A' },
  badgeOff: { color: brand.textFaint, backgroundColor: brand.surfaceAlt },
  finding: { backgroundColor: brand.surface, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: 4 },
  sev: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  detail: { color: brand.text, fontSize: 13.5, lineHeight: 19 },
  fix: { color: brand.textFaint, fontSize: 12, lineHeight: 17 },
  passedWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  passedChip: {
    color: brand.success,
    fontSize: 11.5,
    backgroundColor: brand.success + '14',
    borderRadius: 5,
    paddingHorizontal: 7,
    paddingVertical: 2,
    overflow: 'hidden',
  },
  historyWrap: { gap: 4 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4, borderTopWidth: 1, borderTopColor: brand.border },
  historyScore: { fontSize: 12.5, fontWeight: '700' },
  historyDate: { color: brand.textFaint, fontSize: 11.5 },
  divider: { height: 1, backgroundColor: brand.border, marginVertical: space.sm },
  item: { backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  itemTop: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  itemLabel: { color: brand.text, fontSize: 14, fontWeight: '600', lineHeight: 19 },
  itemHelper: { color: brand.textFaint, fontSize: 12, lineHeight: 17, marginTop: 2 },
  input: {
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 14,
  },
});
