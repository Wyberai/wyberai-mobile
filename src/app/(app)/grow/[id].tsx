import { useEffect, useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import QRCode from 'qrcode';
import { supabase } from '@/lib/supabase';
import { fetchIsIndia, saveFiles, type FileMap } from '@/lib/api';
import {
  EMPTY_GROW_CONFIG, applyGrowKit, removeGrowKit, readGrowConfig, canApplyGrowKit,
  isGrowKitInstalled, isValidUpiId, normalizeWhatsApp, upiLink, activeWidgets, type GrowConfig,
} from '@/lib/grow-kit';
import { tap } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

// Grow — WhatsApp + UPI pay buttons and LocalBusiness JSON-LD, written straight
// into the app's files at 0 credits (same deterministic transform as web's
// GrowPanel; lib/grow-kit.ts is a verbatim copy). India-only: the gate is the
// web's own IP-country rule via GET /api/region, and it fails closed.

type ProjectRow = { name?: string; deployed_url?: string | null; files?: FileMap };

export default function GrowScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [india, setIndia] = useState(false);
  const [project, setProject] = useState<ProjectRow | null>(null);
  const [files, setFiles] = useState<FileMap>({});
  const [draft, setDraft] = useState<GrowConfig | null>(null);
  const [busy, setBusy] = useState<'apply' | 'remove' | null>(null);

  useEffect(() => {
    if (!id) return;
    Promise.all([
      fetchIsIndia(),
      Promise.resolve(supabase.from('projects').select('name,deployed_url,files').eq('id', id).maybeSingle()),
    ])
      .then(([isIn, { data }]) => {
        const row = (data as ProjectRow | null) ?? null;
        setIndia(isIn);
        setProject(row);
        setFiles(row?.files ?? {});
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  const fileMap = files as Record<string, unknown>;
  const supported = Object.keys(fileMap).length >= 2 && canApplyGrowKit(fileMap);
  const installed = isGrowKitInstalled(fileMap);
  const saved = useMemo(() => readGrowConfig(fileMap), [fileMap]);
  const cfg: GrowConfig = draft ?? saved ?? { ...EMPTY_GROW_CONFIG, businessName: project?.name ?? '' };
  const set = (patch: Partial<GrowConfig>) => setDraft({ ...cfg, ...patch });

  const waError = cfg.showWhatsApp && cfg.whatsapp && normalizeWhatsApp(cfg.whatsapp).length < 8 ? 'Enter a full number with country code' : '';
  const upiError = cfg.showUpi && cfg.upiId && !isValidUpiId(cfg.upiId) ? 'Looks like name@bank, e.g. shopname@okicici' : '';
  const live = activeWidgets(cfg);
  const canApply = !!cfg.businessName.trim() && !waError && !upiError && !busy;

  async function write(next: Record<string, unknown>, kind: 'apply' | 'remove', okMsg: string) {
    if (!id) return;
    tap();
    setBusy(kind);
    try {
      await saveFiles(id, next as FileMap);
      setFiles(next as FileMap);
      setDraft(null);
      showToast(okMsg);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function apply() {
    if (!canApply) return;
    const qrSvg = live.upi
      ? await QRCode.toString(upiLink(cfg.upiId, cfg.upiName || cfg.businessName), { type: 'svg', margin: 1, errorCorrectionLevel: 'M' })
      : '';
    const next = applyGrowKit(fileMap, cfg, { qrSvg, siteUrl: project?.deployed_url || undefined });
    await write(next, 'apply', installed ? 'Updated in your app' : 'Added to your app');
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Grow' }} />
        <Spinner />
      </View>
    );
  }

  // Outside India (or the check failed) the screen is simply not available.
  if (!india) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Grow' }} />
        <Ionicons name="location-outline" size={40} color={brand.textFaint} />
        <Text style={styles.emptyTitle}>Only available in India</Text>
        <Text style={styles.emptyBody}>The WhatsApp and UPI kit is built for businesses that sell in India.</Text>
      </View>
    );
  }

  if (!supported) {
    const none = Object.keys(fileMap).length < 2;
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Grow' }} />
        <Ionicons name="trending-up-outline" size={40} color={brand.textFaint} />
        <Text style={styles.emptyTitle}>{none ? 'Build your app first' : 'Web apps only for now'}</Text>
        <Text style={styles.emptyBody}>
          {none
            ? 'Then add WhatsApp, UPI payments and your Google listing details here, free.'
            : 'The Grow kit adds buttons to a web app. Mobile app support is coming.'}
        </Text>
      </View>
    );
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Grow' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.headerRow}>
          <Text style={styles.headerText}>Turn visitors into customers</Text>
          <View style={styles.freeChip}><Text style={styles.freeChipText}>0 credits</Text></View>
        </View>

        <Field label="Business name">
          <TextInput style={styles.input} value={cfg.businessName} onChangeText={(v) => set({ businessName: v })} placeholder="Your business name" placeholderTextColor={brand.textFaint} />
        </Field>

        <View style={styles.group}>
          <ToggleRow label="WhatsApp button" on={cfg.showWhatsApp} onChange={(v) => set({ showWhatsApp: v })} />
          {cfg.showWhatsApp && (
            <>
              <Field label="WhatsApp number" hint="10-digit Indian numbers get +91 automatically" error={waError}>
                <TextInput style={styles.input} keyboardType="phone-pad" value={cfg.whatsapp} onChangeText={(v) => set({ whatsapp: v })} placeholder="98765 43210" placeholderTextColor={brand.textFaint} />
              </Field>
              <Field label="Message customers start with">
                <TextInput style={styles.input} value={cfg.whatsappMessage} onChangeText={(v) => set({ whatsappMessage: v })} placeholderTextColor={brand.textFaint} />
              </Field>
            </>
          )}
        </View>

        <View style={styles.group}>
          <ToggleRow label="Pay with UPI button" on={cfg.showUpi} onChange={(v) => set({ showUpi: v })} />
          {cfg.showUpi && (
            <>
              <Field label="UPI ID" hint="Opens GPay / PhonePe / Paytm on phones, shows a QR on computers" error={upiError}>
                <TextInput style={styles.input} value={cfg.upiId} onChangeText={(v) => set({ upiId: v })} autoCapitalize="none" autoCorrect={false} placeholder="yourname@okicici" placeholderTextColor={brand.textFaint} />
              </Field>
              <Field label="Name customers see when paying">
                <TextInput style={styles.input} value={cfg.upiName} onChangeText={(v) => set({ upiName: v })} placeholder={cfg.businessName || 'Business name'} placeholderTextColor={brand.textFaint} />
              </Field>
            </>
          )}
        </View>

        <View style={{ gap: space.sm }}>
          <Text style={styles.sectionTitle}>Google & AI search details</Text>
          <Text style={styles.hint}>Added as LocalBusiness data so search shows your phone, address and hours</Text>
          <Field label="Phone (optional)" hint="Uses your WhatsApp number if left blank">
            <TextInput style={styles.input} keyboardType="phone-pad" value={cfg.phone} onChangeText={(v) => set({ phone: v })} placeholderTextColor={brand.textFaint} />
          </Field>
          <Field label="Address">
            <TextInput style={styles.input} value={cfg.address} onChangeText={(v) => set({ address: v })} placeholder="Shop no., street, area" placeholderTextColor={brand.textFaint} />
          </Field>
          <Field label="City">
            <TextInput style={styles.input} value={cfg.city} onChangeText={(v) => set({ city: v })} placeholderTextColor={brand.textFaint} />
          </Field>
          <Field label="Hours">
            <TextInput style={styles.input} value={cfg.hours} onChangeText={(v) => set({ hours: v })} placeholder="Mo-Sa 10:00-20:00" placeholderTextColor={brand.textFaint} />
          </Field>
        </View>

        <Pressable onPress={apply} disabled={!canApply} style={({ pressed }) => [styles.primary, (!canApply || pressed) && { opacity: 0.6 }]}>
          <Text style={styles.primaryText}>{busy === 'apply' ? 'Adding…' : installed ? 'Update my app' : 'Add to my app'}</Text>
        </Pressable>
        {installed && (
          <Pressable onPress={() => write(removeGrowKit(fileMap), 'remove', 'Removed from your app')} disabled={!!busy} hitSlop={8}>
            <Text style={styles.removeText}>{busy === 'remove' ? 'Removing…' : 'Remove Grow kit from my app'}</Text>
          </Pressable>
        )}
        <Text style={styles.fine}>Buttons sit beside your app, not inside it · publish picks them up automatically</Text>

        <View style={styles.next}>
          <Text style={styles.sectionTitle}>Then, get found</Text>
          <Pressable onPress={() => Linking.openURL('https://business.google.com/create').catch(() => {})} style={styles.nextRow}>
            <Text style={styles.nextLabel}>List on Google Maps</Text>
            <Text style={styles.hint}>Free Google Business Profile, add your published link as the website</Text>
          </Pressable>
          <Pressable onPress={() => router.push(`/launch-kit/${id}` as Href)} style={styles.nextRow}>
            <Text style={styles.nextLabel}>Counter QR + WhatsApp post</Text>
            <Text style={styles.hint}>Launch Kit, once your app is live</Text>
          </Pressable>
        </View>
      </ScrollView>
    </>
  );
}

function Field({ label, hint, error, children }: { label: string; hint?: string; error?: string; children: React.ReactNode }) {
  return (
    <View style={{ gap: 4 }}>
      <Text style={styles.label}>{label}</Text>
      {children}
      {error || hint ? <Text style={[styles.hint, !!error && { color: brand.danger }]}>{error || hint}</Text> : null}
    </View>
  );
}

function ToggleRow({ label, on, onChange }: { label: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <View style={styles.toggleRow}>
      <Text style={styles.toggleLabel}>{label}</Text>
      <Switch value={on} onValueChange={onChange} trackColor={{ true: brand.accent, false: brand.border }} />
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, backgroundColor: brand.bg },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700', marginTop: space.sm },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  headerRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  headerText: { color: brand.textMuted, fontSize: 13 },
  freeChip: { backgroundColor: 'rgba(34,197,94,0.12)', borderWidth: 1, borderColor: 'rgba(34,197,94,0.3)', paddingHorizontal: space.sm + 2, paddingVertical: 3, borderRadius: radius.pill },
  freeChipText: { color: brand.success, fontSize: 11, fontWeight: '800' },
  group: { gap: space.sm + 1, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  toggleRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  toggleLabel: { color: brand.text, fontSize: 14, fontWeight: '600' },
  label: { color: brand.textMuted, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  hint: { color: brand.textFaint, fontSize: 11.5, lineHeight: 16 },
  input: { backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, borderRadius: radius.sm + 2, paddingHorizontal: space.md, paddingVertical: 10, color: brand.text, fontSize: 14 },
  sectionTitle: { color: brand.text, fontSize: 14, fontWeight: '700' },
  primary: { backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  removeText: { color: brand.textMuted, fontSize: 12.5, textAlign: 'center' },
  fine: { color: brand.textFaint, fontSize: 11.5, textAlign: 'center' },
  next: { gap: space.sm, borderTopWidth: 1, borderTopColor: brand.border, paddingTop: space.md },
  nextRow: { gap: 2, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  nextLabel: { color: brand.text, fontSize: 14, fontWeight: '600' },
});
