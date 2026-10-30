import { useEffect, useMemo, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { creditCost } from '@/lib/credits';
import { tap } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// "Launch your website" — the same five steps as the web editor's checklist
// (build, photos, SEO + AI-search, publish, own domain). Progress is read from
// the site itself (its files and publish status), so a step only ticks when the
// site really has it. Every action opens an existing screen or sheet.

const PHOTOS = 4;
const GENERATED_IMG = /\/storage\/v1\/object\/public\/generated-images\/[^"')\s]+/g;

type Props = {
  projectId: string;
  isPublic: boolean;
  customDomain: string | null;
  domainVerified: boolean;
  onOpenBuilder: () => void;
  onOpenSeo: () => void;
  onPublish: () => void;
  onDomain: () => void;
};

export function WebsiteLaunchChecklist(p: Props) {
  const [open, setOpen] = useState(true);
  const [files, setFiles] = useState<Record<string, { content?: string }>>({});

  useEffect(() => {
    Promise.resolve(supabase.from('projects').select('files').eq('id', p.projectId).maybeSingle())
      .then(({ data }) => setFiles(((data as { files?: Record<string, { content?: string }> } | null)?.files) ?? {}))
      .catch(() => {});
  }, [p.projectId, p.isPublic]);

  const derived = useMemo(() => {
    const keys = Object.keys(files);
    const all = Object.values(files).map((f) => f?.content ?? '').join('\n');
    const photos = new Set(all.match(GENERATED_IMG) ?? []).size;
    const html = files['index.html']?.content ?? '';
    const has = (name: string) => keys.some((k) => k === name || k.endsWith(`/${name}`));
    return {
      built: keys.length >= 3,
      photos,
      seoReady: /name=["']description["']/i.test(html) && /application\/ld\+json/i.test(html) && has('llms.txt'),
    };
  }, [files]);

  const photoCredits = creditCost('hero-image-gen');
  const steps: { key: string; title: string; done: boolean; detail: string; action?: { label: string; run: () => void } }[] = [
    { key: 'build', title: 'Build your website', done: derived.built, detail: 'Your pages, menu or services, WhatsApp and contact.' },
    {
      key: 'photos',
      title: `Add ${PHOTOS} professional photos`,
      done: derived.photos >= PHOTOS,
      detail: `${Math.min(derived.photos, PHOTOS)}/${PHOTOS} on your site · use Hero quality in Images · ${photoCredits} credits each`,
      action: { label: 'Open builder', run: p.onOpenBuilder },
    },
    {
      key: 'seo',
      title: 'Make it readable by Google and AI',
      done: derived.seoReady,
      detail: `SEO + AI-search pass: 18 checks with auto-fixes, incl. llms.txt · ${creditCost('seo-scan')} credits`,
      action: { label: 'Run the pass', run: p.onOpenSeo },
    },
    {
      key: 'publish',
      title: 'Publish it',
      done: p.isPublic,
      detail: 'Free. Published websites get an AI-readable copy of every page.',
      action: { label: p.isPublic ? 'Republish' : 'Publish', run: p.onPublish },
    },
    {
      key: 'domain',
      title: 'Put it on your own domain',
      done: p.domainVerified,
      detail: p.customDomain && !p.domainVerified ? `${p.customDomain} · waiting for DNS` : 'Connect a domain you own, then add the link to your Instagram bio',
      action: { label: 'Connect domain', run: p.onDomain },
    },
  ];
  const doneCount = steps.filter((s) => s.done).length;
  const next = steps.find((s) => !s.done);

  return (
    <View style={styles.wrap}>
      <Pressable onPress={() => { tap(); setOpen((o) => !o); }} style={styles.head} accessibilityRole="button" accessibilityState={{ expanded: open }}>
        <Text style={styles.title}>Launch your website</Text>
        <Text style={[styles.count, doneCount === steps.length && { color: brand.success }]}>{doneCount}/{steps.length}</Text>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={14} color={brand.textMuted} />
      </Pressable>
      <View style={styles.track}><View style={[styles.fill, { width: `${(doneCount / steps.length) * 100}%` }]} /></View>
      {open ? (
        <View style={styles.list}>
          {steps.map((s) => {
            const isNext = s === next;
            return (
              <View key={s.key} style={[styles.row, s.done && { opacity: 0.62 }]}>
                <View style={[styles.dot, s.done ? styles.dotDone : { borderColor: isNext ? brand.accent : brand.border }]}>
                  {s.done ? <Ionicons name="checkmark" size={11} color="#fff" /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={[styles.stepTitle, s.done && { textDecorationLine: 'line-through' }]}>{s.title}</Text>
                  {!s.done ? <Text style={styles.detail}>{s.detail}</Text> : null}
                </View>
                {s.action && !s.done ? (
                  <Pressable onPress={() => { tap(); s.action!.run(); }} style={[styles.btn, isNext && styles.btnNext]}>
                    <Text style={[styles.btnText, isNext && { color: brand.onAccent }]}>{s.action.label}</Text>
                  </Pressable>
                ) : null}
              </View>
            );
          })}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingHorizontal: space.md, paddingTop: space.md, paddingBottom: 8 },
  title: { color: brand.text, fontSize: 14, fontWeight: '700', flex: 1 },
  count: { color: brand.textMuted, fontSize: 12 },
  track: { height: 3, borderRadius: 3, backgroundColor: brand.border, marginHorizontal: space.md, overflow: 'hidden' },
  fill: { height: '100%', backgroundColor: brand.accent },
  list: { padding: space.md, gap: space.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: space.sm + 1 },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 1.5, alignItems: 'center', justifyContent: 'center', marginTop: 1 },
  dotDone: { backgroundColor: brand.success, borderColor: brand.success },
  stepTitle: { color: brand.text, fontSize: 13.5, fontWeight: '600' },
  detail: { color: brand.textFaint, fontSize: 11.5, lineHeight: 16, marginTop: 1 },
  btn: { borderRadius: radius.sm + 1, borderWidth: 1, borderColor: brand.border, paddingHorizontal: space.sm + 2, paddingVertical: 5 },
  btnNext: { backgroundColor: brand.accent, borderColor: brand.accent },
  btnText: { color: brand.textMuted, fontSize: 11.5, fontWeight: '700' },
});
