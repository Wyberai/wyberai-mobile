import { useState } from 'react';
import { ActivityIndicator, Linking, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { runBeastScan, runDependencyScan, type BeastScanResult, type DepReport } from '@/lib/api';
import { applyBeastFixesToProject } from '@/lib/beast-fixes';
import { creditCost } from '@/lib/credits';
import { SECURITY_BEAST_CHECKLIST, SECURITY_FIX_PROMPTS, type CheckStatus } from '@/lib/security-beast-data';
import { tap, success } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// Mirrors the web Security tab's "Security Beast" scan (static checks, flat
// credit charge shown BEFORE anything runs) and its dependency-vulnerability
// scan (package.json vs OSV.dev, free). Same endpoints as web.

const STATUS: Record<CheckStatus, { color: string; icon: string }> = {
  pass: { color: brand.success, icon: '✓' },
  warn: { color: '#f59e0b', icon: '!' },
  fail: { color: brand.danger, icon: '✕' },
};
const DEP_SEV: Record<string, string> = { critical: brand.danger, high: '#f97316', medium: '#f59e0b', low: brand.textMuted };

export default function SecurityBeastScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const price = creditCost('security-scan');

  const [phase, setPhase] = useState<'idle' | 'confirm' | 'scanning' | 'done'>('idle');
  const [report, setReport] = useState<BeastScanResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);

  const [depBusy, setDepBusy] = useState(false);
  const [dep, setDep] = useState<DepReport | null>(null);
  const [depError, setDepError] = useState<string | null>(null);

  async function scan() {
    if (!id) return;
    tap();
    setPhase('scanning');
    setError(null);
    setApplied(null);
    try {
      setReport(await runBeastScan(id));
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle');
    }
  }

  const failing = (report?.checks ?? []).filter((c) => c.status !== 'pass');
  const labelOf = (cid: string) => SECURITY_BEAST_CHECKLIST.find((x) => x.id === cid)?.label ?? cid;

  // Same as web's applyBeastFixes: mechanical fixes are written into the project
  // (after a snapshot, so Version History can undo); the rest goes to the builder.
  async function applyAll() {
    if (!report || !id || applying) return;
    tap();
    setApplying(true);
    try {
      const r = await applyBeastFixesToProject({
        projectId: id,
        report,
        snapshotLabel: 'Before Security Beast fixes',
        promptFor: (cid) => SECURITY_FIX_PROMPTS[cid],
      });
      success();
      setApplied(r.filesWritten > 0 ? `Wrote ${r.filesWritten} file${r.filesWritten === 1 ? '' : 's'} into your project.` : 'No automatic fixes were available.');
      if (r.remainingPrompt) router.push(`/build/${id}?prompt=${encodeURIComponent(r.remainingPrompt)}`);
    } catch (e) {
      setApplied(`Couldn't apply fixes: ${(e as Error).message}`);
    }
    setApplying(false);
  }

  function fixOne(cid: string) {
    if (!id) return;
    tap();
    const prompt = SECURITY_FIX_PROMPTS[cid] || `Fix this security issue: ${labelOf(cid)}`;
    router.push(`/build/${id}?prompt=${encodeURIComponent(prompt)}`);
  }

  async function scanDeps() {
    if (!id || depBusy) return;
    tap();
    setDepBusy(true);
    setDepError(null);
    try {
      setDep(await runDependencyScan(id));
    } catch (e) {
      setDepError((e as Error).message);
    }
    setDepBusy(false);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Security Beast', headerBackTitle: 'Back' }} />

      <Text style={styles.h}>Security Beast scan</Text>
      <Text style={styles.body}>
        {SECURITY_BEAST_CHECKLIST.length} static checks on your actual code: hardcoded secrets, XSS, SQL injection, CORS,
        rate limiting, admin-route auth, cookies and webhook signatures.
      </Text>

      {phase === 'idle' ? (
        <Pressable style={styles.danger} onPress={() => { tap(); setPhase('confirm'); }}>
          <Ionicons name="shield-outline" size={16} color={brand.onAccent} />
          <Text style={styles.btnText}>Run Security Beast scan, {price} credits</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {phase !== 'idle' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {phase === 'confirm' ? "We'll check all of this:" : phase === 'scanning' ? 'Scanning…' : `Score ${report?.score ?? 0}/100`}
          </Text>
          {SECURITY_BEAST_CHECKLIST.map((item) => {
            const r = report?.checks.find((c) => c.id === item.id);
            const st = r ? STATUS[r.status] : null;
            return (
              <View key={item.id} style={styles.checkRow}>
                <Text style={[styles.checkIcon, { color: st?.color ?? brand.textFaint }]}>{st?.icon ?? '○'}</Text>
                <View style={styles.flex}>
                  <Text style={styles.checkLabel}>{item.label}</Text>
                  {r && r.status !== 'pass' ? <Text style={styles.checkDetail}>{r.detail}</Text> : null}
                </View>
              </View>
            );
          })}
          {phase === 'confirm' ? (
            <View style={styles.row}>
              <Pressable style={[styles.danger, styles.grow]} onPress={scan}>
                <Text style={styles.btnText}>Go ahead, charge {price} credits</Text>
              </Pressable>
              <Pressable style={styles.ghost} onPress={() => setPhase('idle')}>
                <Text style={styles.ghostText}>Cancel</Text>
              </Pressable>
            </View>
          ) : null}
          {phase === 'scanning' ? <ActivityIndicator color={brand.accent} /> : null}
          {phase === 'done' && report?.creditsRemaining !== undefined ? (
            <Text style={styles.checkDetail}>{report.creditsRemaining} credits left.</Text>
          ) : null}
        </View>
      ) : null}

      {phase === 'done' && failing.length > 0 ? (
        <>
          <Pressable style={[styles.danger, applying && styles.dim]} onPress={applyAll} disabled={applying}>
            {applying ? <ActivityIndicator color={brand.onAccent} /> : <Ionicons name="construct-outline" size={16} color={brand.onAccent} />}
            <Text style={styles.btnText}>Apply all fixes ({failing.length})</Text>
          </Pressable>
          {applied ? <Text style={styles.body}>{applied}</Text> : null}
          <Text style={styles.sub}>Or fix one at a time</Text>
          {failing.map((c) => (
            <Pressable key={c.id} style={styles.fixBtn} onPress={() => fixOne(c.id)}>
              <Ionicons name="sparkles-outline" size={14} color={brand.accent} />
              <Text style={styles.fixText}>{labelOf(c.id)}</Text>
            </Pressable>
          ))}
        </>
      ) : null}
      {phase === 'done' ? (
        <Pressable style={styles.ghost} onPress={() => { setPhase('idle'); setReport(null); }}>
          <Text style={styles.ghostText}>Run again</Text>
        </Pressable>
      ) : null}

      <View style={styles.divider} />

      <Text style={styles.h}>Dependency vulnerabilities</Text>
      <Text style={styles.body}>
        Checks every package in package.json against the OSV.dev advisory database: real CVEs, not a guess. Free.
      </Text>
      <Pressable style={[styles.ghost, depBusy && styles.dim]} onPress={scanDeps} disabled={depBusy}>
        {depBusy ? <ActivityIndicator color={brand.accent} /> : <Ionicons name="cube-outline" size={16} color={brand.accent} />}
        <Text style={styles.ghostText}>{depBusy ? 'Scanning packages…' : 'Scan dependencies'}</Text>
      </Pressable>
      {depError ? <Text style={styles.error}>{depError}</Text> : null}
      {dep ? (
        <>
          <View style={styles.card}>
            <Text style={[styles.depCount, { color: dep.vulnerabilityCount === 0 ? brand.success : brand.danger }]}>
              {dep.vulnerabilityCount}
            </Text>
            <Text style={styles.checkLabel}>
              {dep.vulnerabilityCount === 0 ? 'No known vulnerabilities' : `known ${dep.vulnerabilityCount === 1 ? 'vulnerability' : 'vulnerabilities'}`}
            </Text>
            <Text style={styles.checkDetail}>
              {dep.packagesScanned} package{dep.packagesScanned === 1 ? '' : 's'} scanned
              {dep.packagesSkipped > 0 ? ` · ${dep.packagesSkipped} skipped (unresolvable version range)` : ''}
            </Text>
          </View>
          {dep.findings.map((f, i) => (
            <View key={`${f.id}-${i}`} style={[styles.card, { borderColor: (DEP_SEV[f.severity] ?? brand.border) + '66' }]}>
              <View style={styles.row}>
                <Text style={[styles.sev, { color: DEP_SEV[f.severity] }]}>{f.severity.toUpperCase()}</Text>
                <Pressable onPress={() => Linking.openURL(f.url).catch(() => {})} hitSlop={8}>
                  <Text style={styles.link}>{f.id}</Text>
                </Pressable>
              </View>
              <Text style={styles.checkLabel}>{f.package}@{f.version}</Text>
              <Text style={styles.checkDetail}>{f.summary}</Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  grow: { flex: 1 },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  h: { color: brand.text, fontSize: 18, fontWeight: '700' },
  sub: { color: brand.textFaint, fontSize: 11.5, fontWeight: '700', letterSpacing: 0.6, textTransform: 'uppercase' },
  body: { color: brand.textMuted, fontSize: 13.5, lineHeight: 19 },
  error: { color: brand.danger, fontSize: 13, lineHeight: 18 },
  danger: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.danger, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  btnText: { color: brand.onAccent, fontSize: 14.5, fontWeight: '700' },
  ghost: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  ghostText: { color: brand.accent, fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.7 },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center', justifyContent: 'space-between' },
  card: { backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  cardTitle: { color: brand.text, fontSize: 14, fontWeight: '700' },
  checkRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  checkIcon: { width: 16, fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 1 },
  checkLabel: { color: brand.text, fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  checkDetail: { color: brand.textFaint, fontSize: 12, lineHeight: 17 },
  fixBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: 'rgba(14,165,233,0.1)' },
  fixText: { color: brand.accent, fontSize: 12.5, fontWeight: '700' },
  divider: { height: 1, backgroundColor: brand.border, marginVertical: space.sm },
  depCount: { fontSize: 30, fontWeight: '800' },
  sev: { fontSize: 10.5, fontWeight: '800', letterSpacing: 0.5 },
  link: { color: brand.accent, fontSize: 12, fontWeight: '600' },
});
