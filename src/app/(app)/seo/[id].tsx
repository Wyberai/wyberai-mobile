import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { loadProjectType, runSeoScan, type SeoCheck, type SeoReport } from '@/lib/api';
import { applyBeastFixesToProject } from '@/lib/beast-fixes';
import { creditCost } from '@/lib/credits';
import { MARKETING_BEAST_SETS, SEO_BEAST_CHECKLIST, SEO_FIX_PROMPTS, resolveMarketingBeastType } from '@/lib/seo-beast-data';
import { tap, success } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// Mirrors the web "SEO & Marketing Beast" tab: the full checklist and the
// credit price are shown BEFORE anything is charged; results tick through the
// same checklist; "Apply all fixes" writes the mechanical fixes into the
// project and sends the rest to the builder; "Make it a Marketing Beast"
// dispatches the per-project-type launch bundle as one ordinary edit.

const STATUS: Record<SeoCheck['status'], { color: string; icon: string }> = {
  pass: { color: brand.success, icon: '✓' },
  warn: { color: '#f59e0b', icon: '!' },
  fail: { color: brand.danger, icon: '✕' },
};
const PURPLE = '#a855f7';

export default function SeoScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const price = creditCost('seo-scan');

  const [phase, setPhase] = useState<'idle' | 'confirm' | 'scanning' | 'done'>('idle');
  const [report, setReport] = useState<SeoReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [applied, setApplied] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [projectType, setProjectType] = useState<string | undefined>();
  const [beastArmed, setBeastArmed] = useState(false);

  useEffect(() => {
    if (id) loadProjectType(id).then(setProjectType).catch(() => {});
  }, [id]);

  const beastType = resolveMarketingBeastType(projectType);
  const beast = MARKETING_BEAST_SETS[beastType];
  const failing = (report?.checks ?? []).filter((c) => c.status !== 'pass');
  const labelOf = (cid: string) => SEO_BEAST_CHECKLIST.find((x) => x.id === cid)?.label ?? cid;

  async function scan() {
    if (!id) return;
    tap();
    setPhase('scanning');
    setError(null);
    setApplied(null);
    try {
      setReport(await runSeoScan(id));
      setPhase('done');
    } catch (e) {
      setError((e as Error).message);
      setPhase('idle');
    }
  }

  async function applyAll() {
    if (!report || !id || applying) return;
    tap();
    setApplying(true);
    try {
      const r = await applyBeastFixesToProject({
        projectId: id,
        report,
        snapshotLabel: 'Before SEO & Marketing Beast fixes',
        promptFor: (cid) => SEO_FIX_PROMPTS[cid],
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
    const prompt = SEO_FIX_PROMPTS[cid] || `Fix this SEO issue: ${labelOf(cid)}`;
    router.push(`/build/${id}?prompt=${encodeURIComponent(prompt)}`);
  }

  function makeBeast() {
    if (!id) return;
    tap();
    if (!beastArmed) {
      setBeastArmed(true);
      return;
    }
    setBeastArmed(false);
    router.push(`/build/${id}?prompt=${encodeURIComponent(beast.prompt)}`);
  }

  const whatFor = beastType === 'mobile' ? 'app store submission' : beastType === 'saas' ? 'SaaS product' : beastType === 'website' ? 'site' : 'app';

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'SEO & Marketing', headerBackTitle: 'Back' }} />

      <Text style={styles.h}>SEO & Marketing Beast scan</Text>
      <Text style={styles.body}>
        {SEO_BEAST_CHECKLIST.length} real checks on your actual files: meta tags, social previews, accessibility, analytics,
        cookies, robots.txt, sitemap and AI-readability.
      </Text>

      {phase === 'idle' ? (
        <Pressable style={styles.primary} onPress={() => { tap(); setPhase('confirm'); }}>
          <Ionicons name="search-outline" size={16} color={brand.onAccent} />
          <Text style={styles.btnText}>Run SEO & Marketing scan, {price} credits</Text>
        </Pressable>
      ) : null}
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {phase !== 'idle' ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>
            {phase === 'confirm' ? "We'll check all of this:" : phase === 'scanning' ? 'Scanning…' : `Score ${report?.score ?? 0}/100`}
          </Text>
          {SEO_BEAST_CHECKLIST.map((item) => {
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
              <Pressable style={[styles.primary, styles.grow]} onPress={scan}>
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
          <Pressable style={[styles.primary, applying && styles.dim]} onPress={applyAll} disabled={applying}>
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

      <View style={styles.beastCard}>
        <Text style={styles.cardTitle}>Make it a Marketing Beast</Text>
        <Text style={styles.checkDetail}>
          Adds the {beast.items.length} launch-readiness pieces every {whatFor} needs, in one pass. Priced like any large
          edit based on what actually gets built.
        </Text>
        {beast.items.map((item) => (
          <View key={item.label} style={styles.checkRow}>
            <Text style={[styles.checkIcon, { color: PURPLE }]}>✓</Text>
            <View style={styles.flex}>
              <Text style={styles.checkLabel}>{item.label}</Text>
              <Text style={styles.checkDetail}>{item.detail}</Text>
            </View>
          </View>
        ))}
        <Pressable style={[styles.beastBtn, beastArmed && { backgroundColor: PURPLE }]} onPress={makeBeast}>
          <Text style={[styles.beastText, beastArmed && { color: brand.onAccent }]}>
            {beastArmed ? 'Tap again to confirm' : 'Make it a Marketing Beast'}
          </Text>
        </Pressable>
      </View>
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
  primary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  btnText: { color: brand.onAccent, fontSize: 14.5, fontWeight: '700' },
  ghost: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, paddingVertical: space.md, paddingHorizontal: space.lg },
  ghostText: { color: brand.accent, fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.7 },
  row: { flexDirection: 'row', gap: space.sm, alignItems: 'center' },
  card: { backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  cardTitle: { color: brand.text, fontSize: 14, fontWeight: '700' },
  checkRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  checkIcon: { width: 16, fontSize: 14, fontWeight: '800', textAlign: 'center', marginTop: 1 },
  checkLabel: { color: brand.text, fontSize: 13.5, fontWeight: '600', lineHeight: 18 },
  checkDetail: { color: brand.textFaint, fontSize: 12, lineHeight: 17 },
  fixBtn: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'flex-start', paddingVertical: 6, paddingHorizontal: space.sm, borderRadius: radius.sm, backgroundColor: 'rgba(14,165,233,0.1)' },
  fixText: { color: brand.accent, fontSize: 12.5, fontWeight: '700' },
  beastCard: { borderWidth: 1, borderColor: 'rgba(168,85,247,0.25)', backgroundColor: 'rgba(168,85,247,0.06)', borderRadius: radius.lg, padding: space.md, gap: space.sm },
  beastBtn: { alignItems: 'center', borderRadius: radius.md, paddingVertical: space.md, backgroundColor: 'rgba(168,85,247,0.15)' },
  beastText: { color: PURPLE, fontSize: 14, fontWeight: '700' },
});
