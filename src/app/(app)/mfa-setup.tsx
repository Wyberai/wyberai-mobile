import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import QRCode from 'react-native-qrcode-svg';
import { Ionicons } from '@expo/vector-icons';
import { supabase } from '@/lib/supabase';
import { disableMfaBookkeeping, fetchMfaRecoveryCodes } from '@/lib/api';
import { tap, warn } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

type Factor = { id: string; status: string; factor_type: string };
type Enrollment = { id: string; uri: string; secret: string };

export default function MfaSetupScreen() {
  const [loading, setLoading] = useState(true);
  const [factors, setFactors] = useState<Factor[]>([]);
  // The real login-time gate (src/proxy.ts on web) checks profiles.mfa_enabled,
  // NOT whether a verified TOTP factor exists — that flag is only set once
  // recovery codes are generated (src/lib/mfa/recovery.ts). Deriving "Enabled"
  // from listFactors() alone let the two go out of sync: a verified factor
  // with a failed recovery-code call looks "Enabled" here but is NOT actually
  // gated at login. Track both so a factor-without-the-flag renders as its
  // own "finish setup" state instead of a false "Enabled".
  const [mfaEnabledFlag, setMfaEnabledFlag] = useState(false);
  const [enroll, setEnroll] = useState<Enrollment | null>(null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [recovery, setRecovery] = useState<string[] | null>(null);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.getUser(),
    ])
      .then(async ([factorsRes, userRes]) => {
        setFactors(((factorsRes.data?.all ?? []) as Factor[]).filter((f) => f.factor_type === 'totp'));
        const userId = userRes.data.user?.id;
        if (userId) {
          const { data: profile } = await supabase.from('profiles').select('mfa_enabled').eq('id', userId).maybeSingle();
          setMfaEnabledFlag(!!profile?.mfa_enabled);
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, []);

  useFocusEffect(load);

  const verified = factors.filter((f) => f.status === 'verified');
  const fullyEnabled = verified.length > 0 && mfaEnabledFlag;
  const setupIncomplete = verified.length > 0 && !mfaEnabledFlag;

  async function startEnroll() {
    tap();
    setBusy(true);
    const { data, error } = await supabase.auth.mfa.enroll({
      factorType: 'totp',
      friendlyName: `WyberAi mobile ${new Date().toISOString()}`,
    });
    setBusy(false);
    if (error) {
      Alert.alert('Could not start setup', error.message);
      return;
    }
    setEnroll({ id: data.id, uri: data.totp.uri, secret: data.totp.secret });
  }

  async function confirmEnroll() {
    if (!enroll || code.length !== 6) return;
    tap();
    setBusy(true);
    const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId: enroll.id, code: code.trim() });
    if (error) {
      setBusy(false);
      warn();
      Alert.alert('Verification failed', error.message);
      return;
    }
    // Generating recovery codes is what actually flips profiles.mfa_enabled
    // server-side (see the mfaEnabledFlag comment above) — a silent failure
    // here would leave the account looking "Enabled" in this screen while
    // login never actually challenges for a code. Surface it and let the
    // user retry from the resulting "finish setup" state instead of hiding it.
    try {
      const codes = await fetchMfaRecoveryCodes();
      setRecovery(codes);
    } catch (e) {
      warn();
      Alert.alert(
        'Almost done',
        `Your code verified, but we couldn't generate recovery codes (${(e as Error).message}). Tap "Finish setup" below to retry — 2FA isn't fully active until that succeeds.`,
      );
    }
    setBusy(false);
    setEnroll(null);
    setCode('');
    load();
  }

  async function finishSetup() {
    tap();
    setBusy(true);
    try {
      const codes = await fetchMfaRecoveryCodes();
      setRecovery(codes);
      load();
    } catch (e) {
      Alert.alert('Still failed', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnroll() {
    if (enroll) await supabase.auth.mfa.unenroll({ factorId: enroll.id }).catch(() => {});
    setEnroll(null);
    setCode('');
  }

  async function regenerate() {
    tap();
    setBusy(true);
    try {
      const codes = await fetchMfaRecoveryCodes();
      setRecovery(codes);
    } catch (e) {
      Alert.alert('Could not regenerate codes', (e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function onRemove(id: string) {
    Alert.alert('Remove 2FA?', 'You will no longer be asked for a code.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          setBusy(true);
          try {
            const { error } = await supabase.auth.mfa.unenroll({ factorId: id });
            if (error) {
              Alert.alert('Could not remove', error.message);
              return;
            }
            await disableMfaBookkeeping();
            setRecovery(null);
            load();
          } catch (e) {
            Alert.alert('Could not remove', (e as Error).message);
          } finally {
            setBusy(false);
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Two-Factor Auth', headerBackTitle: 'Back' }} />
        <Spinner />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Two-Factor Auth', headerBackTitle: 'Back' }} />
        <Text style={styles.cardHint}>Couldn't load your 2FA status.</Text>
        <Pressable onPress={() => { setLoading(true); load(); }} style={[styles.cta, { marginTop: space.md }]}>
          <Text style={styles.ctaText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: 'Two-Factor Auth', headerBackTitle: 'Back' }} />
      <Text style={styles.intro}>
        Add an authenticator app (Google Authenticator, Authy, 1Password) as a second factor for your account.
      </Text>

      {recovery ? (
        <View style={[styles.card, styles.recoveryCard]}>
          <Text style={styles.recoveryTitle}>Save your recovery codes</Text>
          <Text style={styles.recoveryBody}>
            Each code works once. Store them somewhere safe — they won't be shown again.
          </Text>
          <View style={styles.recoveryGrid}>
            {recovery.map((c) => (
              <Text key={c} style={styles.recoveryCode}>{c}</Text>
            ))}
          </View>
          <Pressable onPress={() => setRecovery(null)} style={styles.ctaSecondary}>
            <Text style={[styles.ctaText, { color: brand.text }]}>I've saved them</Text>
          </Pressable>
        </View>
      ) : null}

      {enroll ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Scan this QR code</Text>
          <Text style={styles.cardHint}>Open your authenticator app and scan, or enter the key manually.</Text>
          <View style={styles.qrWrap}>
            <QRCode value={enroll.uri} size={180} />
          </View>
          <Text style={styles.label}>Manual key</Text>
          <Text selectable style={styles.secretText}>{enroll.secret}</Text>
          <TextInput
            style={styles.codeInput}
            value={code}
            onChangeText={(v) => setCode(v.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            placeholderTextColor={brand.textFaint}
            keyboardType="number-pad"
            maxLength={6}
          />
          <View style={styles.row}>
            <Pressable onPress={confirmEnroll} disabled={busy || code.length !== 6} style={[styles.cta, (busy || code.length !== 6) && styles.ctaDisabled, { flex: 1 }]}>
              {busy ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.ctaText}>Enable 2FA</Text>}
            </Pressable>
            <Pressable onPress={cancelEnroll} style={styles.ctaGhost}>
              <Text style={styles.ctaGhostText}>Cancel</Text>
            </Pressable>
          </View>
        </View>
      ) : setupIncomplete ? (
        <View style={[styles.card, styles.recoveryCard]}>
          <Text style={styles.recoveryTitle}>Setup isn't finished</Text>
          <Text style={styles.cardHint}>
            Your code verified, but we couldn't generate recovery codes — 2FA isn't actually protecting your account yet.
          </Text>
          <Pressable onPress={finishSetup} disabled={busy} style={[styles.cta, busy && styles.ctaDisabled, { marginTop: space.md }]}>
            {busy ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.ctaText}>Finish setup</Text>}
          </Pressable>
          <Pressable onPress={() => onRemove(verified[0].id)} disabled={busy} hitSlop={8} style={{ marginTop: space.sm }}>
            <Text style={styles.removeText}>Cancel and remove</Text>
          </Pressable>
        </View>
      ) : fullyEnabled ? (
        <View style={styles.card}>
          <View style={styles.statusRow}>
            <View style={styles.badge}>
              <Ionicons name="checkmark-circle" size={14} color={brand.accent} />
              <Text style={styles.badgeText}>Enabled</Text>
            </View>
            <Pressable onPress={() => onRemove(verified[0].id)} disabled={busy} hitSlop={8}>
              <Text style={styles.removeText}>Remove</Text>
            </Pressable>
          </View>
          <Text style={styles.cardHint}>Your authenticator app is protecting your account.</Text>
          <Pressable onPress={regenerate} disabled={busy} hitSlop={8} style={{ marginTop: space.sm }}>
            <Text style={styles.linkText}>Regenerate recovery codes</Text>
          </Pressable>
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardHint}>2FA is not enabled yet.</Text>
          <Pressable onPress={startEnroll} disabled={busy} style={[styles.cta, busy && styles.ctaDisabled, { marginTop: space.md }]}>
            {busy ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.ctaText}>Set up authenticator app</Text>}
          </Pressable>
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.bg },
  content: { padding: space.lg },
  intro: { color: brand.textMuted, fontSize: 13, lineHeight: 19, marginBottom: space.lg },
  card: { backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, marginBottom: space.md },
  cardTitle: { color: brand.text, fontSize: 15, fontWeight: '700', marginBottom: 4 },
  cardHint: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18 },
  qrWrap: { backgroundColor: '#fff', alignSelf: 'center', padding: space.md, borderRadius: radius.md, marginVertical: space.md },
  label: { color: brand.textFaint, fontSize: 11, fontWeight: '600', marginBottom: 4, textTransform: 'uppercase' },
  secretText: {
    color: brand.textMuted,
    fontSize: 12.5,
    fontFamily: 'monospace',
    backgroundColor: brand.surfaceAlt,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    padding: space.sm,
    marginBottom: space.md,
  },
  codeInput: {
    backgroundColor: brand.surfaceAlt,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    color: brand.text,
    fontSize: 22,
    letterSpacing: 8,
    textAlign: 'center',
    marginBottom: space.md,
  },
  row: { flexDirection: 'row', gap: space.sm },
  cta: { alignItems: 'center', justifyContent: 'center', backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: space.md },
  ctaSecondary: { alignItems: 'center', justifyContent: 'center', backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, paddingVertical: space.md, marginTop: space.sm },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  ctaGhost: { alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border },
  ctaGhostText: { color: brand.textMuted, fontSize: 15, fontWeight: '600' },
  statusRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: 'rgba(34,197,94,0.12)', paddingHorizontal: space.sm, paddingVertical: 3, borderRadius: radius.pill },
  badgeText: { color: brand.accent, fontSize: 11.5, fontWeight: '700' },
  removeText: { color: brand.danger, fontSize: 13, fontWeight: '700' },
  linkText: { color: brand.accent, fontSize: 13, fontWeight: '600', textDecorationLine: 'underline' },
  recoveryCard: { borderColor: 'rgba(245,158,11,0.35)', backgroundColor: 'rgba(245,158,11,0.05)' },
  recoveryTitle: { color: '#f59e0b', fontSize: 14, fontWeight: '700', marginBottom: 6 },
  recoveryBody: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18, marginBottom: space.md },
  recoveryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  recoveryCode: {
    fontFamily: 'monospace',
    fontSize: 13,
    color: brand.text,
    backgroundColor: brand.surfaceAlt,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.sm,
    paddingHorizontal: space.sm,
    paddingVertical: space.xs,
    minWidth: '45%',
    textAlign: 'center',
  },
});
