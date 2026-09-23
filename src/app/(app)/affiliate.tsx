import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  applyAffiliate,
  fetchAffiliateStatus,
  fetchReferral,
  referralLink,
  updatePayoutInfo,
  type AffiliateCommission,
  type AffiliateStatus,
} from '@/lib/api';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, font, radius, space } from '@/lib/theme';

export default function AffiliateScreen() {
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<AffiliateStatus | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [applying, setApplying] = useState(false);
  const [copied, setCopied] = useState(false);
  const [payoutEmail, setPayoutEmail] = useState('');
  const [payoutMethod, setPayoutMethod] = useState('');
  const [savingPayout, setSavingPayout] = useState(false);
  const [loadError, setLoadError] = useState(false);

  const load = useCallback(() => {
    setLoadError(false);
    Promise.all([fetchAffiliateStatus(), fetchReferral()])
      .then(([s, r]) => {
        setStatus(s);
        setCode(r?.code ?? null);
        setPayoutEmail(s.affiliate?.payout_email ?? '');
        setPayoutMethod(s.affiliate?.payout_method ?? '');
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        setLoadError(true);
      });
  }, []);

  useFocusEffect(load);

  async function onApply() {
    if (applying) return;
    tap();
    setApplying(true);
    try {
      await applyAffiliate();
      load();
    } catch (e) {
      Alert.alert('Could not apply', (e as Error).message);
    } finally {
      setApplying(false);
    }
  }

  async function onSavePayout() {
    if (savingPayout) return;
    tap();
    setSavingPayout(true);
    try {
      await updatePayoutInfo({ payoutEmail, payoutMethod });
      Alert.alert('Saved', 'Your payout details were updated.');
    } catch (e) {
      Alert.alert('Could not save', (e as Error).message);
    } finally {
      setSavingPayout(false);
    }
  }

  async function onCopyLink() {
    if (!code) return;
    tap();
    const link = `https://wyberai.com/signup?ref=${code}`;
    try {
      const result = await Share.share({ message: link, url: link });
      if (result.action === Share.dismissedAction) return; // user cancelled — nothing was actually shared
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // sheet dismissed/errored — no confirmation to show
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Affiliate', headerBackTitle: 'Back' }} />
        <Spinner />
      </View>
    );
  }

  if (loadError) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Affiliate', headerBackTitle: 'Back' }} />
        <Text style={styles.intro}>Couldn't load your affiliate status.</Text>
        <Pressable onPress={() => { setLoading(true); load(); }} style={styles.cta}>
          <Text style={styles.ctaText}>Retry</Text>
        </Pressable>
      </View>
    );
  }

  const affiliate = status?.affiliate ?? null;

  return (
    <FlatList
      style={styles.flex}
      contentContainerStyle={styles.content}
      data={affiliate?.status === 'approved' ? status?.commissions ?? [] : []}
      keyExtractor={(c) => c.id}
      ListHeaderComponent={
        <>
          <Stack.Screen options={{ title: 'Affiliate', headerBackTitle: 'Back' }} />
          <Text style={styles.intro}>
            Approved applicants earn cash commission on every payment their referrals make. Reviewed within 24 hours.
          </Text>

          {!affiliate ? (
            <Pressable onPress={onApply} disabled={applying} style={[styles.cta, applying && styles.ctaDisabled]}>
              {applying ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.ctaText}>Apply to become an affiliate</Text>}
            </Pressable>
          ) : affiliate.status === 'pending' ? (
            <View style={styles.statusCard}>
              <Ionicons name="time-outline" size={18} color={brand.textMuted} />
              <Text style={styles.statusText}>Your application is under review.</Text>
            </View>
          ) : affiliate.status !== 'approved' ? (
            <View style={styles.statusCard}>
              <Ionicons name="close-circle-outline" size={18} color={brand.danger} />
              <Text style={styles.statusText}>Your affiliate account is {affiliate.status}.</Text>
            </View>
          ) : (
            <>
              {code ? (
                <View style={styles.linkRow}>
                  <Text style={styles.linkText} numberOfLines={1}>wyberai.com/signup?ref={code}</Text>
                  <Pressable onPress={onCopyLink} style={styles.copyBtn}>
                    <Text style={styles.copyBtnText}>{copied ? 'Copied!' : 'Share'}</Text>
                  </Pressable>
                </View>
              ) : null}

              <View style={styles.earningsRow}>
                <View style={styles.earningCard}>
                  <Text style={styles.earningLabel}>Pending</Text>
                  <Text style={styles.earningValue}>${status?.pendingUsd.toFixed(2)}</Text>
                </View>
                <View style={styles.earningCard}>
                  <Text style={styles.earningLabel}>Paid out</Text>
                  <Text style={styles.earningValue}>${status?.paidUsd.toFixed(2)}</Text>
                </View>
              </View>

              <Text style={styles.label}>Payout details</Text>
              <TextInput
                style={styles.input}
                placeholder="Payout email"
                placeholderTextColor={brand.textFaint}
                value={payoutEmail}
                onChangeText={setPayoutEmail}
                autoCapitalize="none"
                keyboardType="email-address"
              />
              <TextInput
                style={[styles.input, { marginTop: space.sm }]}
                placeholder="Payout method (PayPal, bank transfer, UPI...)"
                placeholderTextColor={brand.textFaint}
                value={payoutMethod}
                onChangeText={setPayoutMethod}
              />
              <Pressable onPress={onSavePayout} disabled={savingPayout} style={[styles.cta, styles.ctaSecondary, savingPayout && styles.ctaDisabled]}>
                {savingPayout ? <ActivityIndicator color={brand.text} /> : <Text style={[styles.ctaText, { color: brand.text }]}>Save payout details</Text>}
              </Pressable>

              {(status?.commissions.length ?? 0) > 0 ? <Text style={[styles.label, { marginTop: space.lg }]}>Commissions</Text> : null}
            </>
          )}
        </>
      }
      ListEmptyComponent={null}
      renderItem={({ item }: { item: AffiliateCommission }) => (
        <View style={styles.commissionRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.commissionTitle}>{item.plan_key || item.dodo_event_type}</Text>
            <Text style={styles.commissionSub}>{new Date(item.created_at).toLocaleDateString()}</Text>
          </View>
          <View style={{ alignItems: 'flex-end' }}>
            <Text style={styles.commissionValue}>${item.commission_usd}</Text>
            <Text style={styles.commissionStatus}>{item.status}</Text>
          </View>
        </View>
      )}
    />
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.bg },
  content: { padding: space.lg },
  intro: { color: brand.textMuted, fontSize: 13, lineHeight: 19, marginBottom: space.lg },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
  },
  ctaSecondary: { backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, marginTop: space.md },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  statusCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
  },
  statusText: { color: brand.textMuted, fontSize: 14, flex: 1 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginBottom: space.md,
  },
  linkText: { flex: 1, color: brand.textMuted, fontSize: 13 },
  copyBtn: { paddingHorizontal: space.md, paddingVertical: space.xs, borderRadius: radius.sm, backgroundColor: brand.accent },
  copyBtnText: { color: brand.onAccent, fontSize: 12.5, fontWeight: '700' },
  earningsRow: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  earningCard: { flex: 1, backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1, borderRadius: radius.md, padding: space.md },
  earningLabel: { color: brand.textFaint, fontSize: 11.5, fontWeight: '600' },
  earningValue: { color: brand.text, fontSize: 20, fontFamily: font.display, marginTop: 2 },
  label: { color: brand.textMuted, fontSize: 13, fontWeight: '600', marginBottom: space.sm },
  input: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 15,
  },
  commissionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: space.sm,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },
  commissionTitle: { color: brand.text, fontSize: 14, fontWeight: '600' },
  commissionSub: { color: brand.textFaint, fontSize: 12 },
  commissionValue: { color: brand.accent, fontSize: 14, fontWeight: '700' },
  commissionStatus: { color: brand.textFaint, fontSize: 11 },
});
