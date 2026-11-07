import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import Constants from 'expo-constants';
import { useSession } from '@/ctx/session';
import { supabase } from '@/lib/supabase';
import {
  deleteAccount,
  fetchCreditHistory,
  fetchReferral,
  referralLink,
  type CreditEvent,
  type ReferralInfo,
} from '@/lib/api';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import type { Profile } from '@/lib/types';
import { useT } from '@/lib/i18n/useT';
import { useLocale } from '@/lib/i18n/LocaleProvider';
import { LOCALES, LOCALE_LABEL } from '@/lib/i18n/locales';
import { ACCOUNT_STRINGS } from '@/lib/i18n/dict/account';
import { BottomSheet } from '@/components/BottomSheet';
import { brand, font, radius, space } from '@/lib/theme';

export default function AccountScreen() {
  const { user, signOut, credits } = useSession();
  const router = useRouter();
  const t = useT(ACCOUNT_STRINGS);
  const { locale, setLocale } = useLocale();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [activity, setActivity] = useState<CreditEvent[]>([]);
  const [referral, setReferral] = useState<ReferralInfo | null>(null);
  const [langOpen, setLangOpen] = useState(false);

  function onInvite() {
    if (!referral) return;
    tap();
    const link = referralLink(referral.code);
    Share.share({
      message: `Build an app in minutes with WyberAi — you'll get 20 free credits when you join with my link: ${link}`,
      url: link,
    }).catch(() => {});
  }

  function onDeleteAccount() {
    Alert.alert(
      t('deleteAccountTitle'),
      t('deleteAccountBody'),
      [
        { text: t('cancel'), style: 'cancel' },
        {
          text: t('delete'),
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteAccount();
              await signOut(); // guard swaps back to sign-in
            } catch (e: any) {
              setDeleting(false);
              Alert.alert('Delete failed', e?.message ?? 'Please try again or contact support.');
            }
          },
        },
      ],
    );
  }

  const loadProfile = useCallback(() => {
    if (!user) return;
    supabase
      .from('profiles')
      .select('id,email,full_name,avatar_url,plan,credits,created_at')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        setProfile((data as Profile) ?? null);
        setLoading(false);
      });
    fetchCreditHistory(12).then(setActivity);
    fetchReferral().then(setReferral);
  }, [user]);

  // Refetch every time the Account tab regains focus, so credits topped up on
  // the web show up the moment the user comes back to the app.
  useFocusEffect(loadProfile);

  const displayName = profile?.full_name || user?.email?.split('@')[0] || 'You';
  const initial = displayName.charAt(0).toUpperCase();

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initial}</Text>
        </View>
        <View style={styles.headerText}>
          <Text style={styles.name}>{displayName}</Text>
          <Text style={styles.email}>{user?.email}</Text>
        </View>
      </View>

      {loading ? (
        <View style={{ marginTop: space.xl, alignItems: 'center' }}>
          <Spinner />
        </View>
      ) : (
        <View style={styles.statRow}>
          <StatCard label={t('credits')} value={String(credits ?? profile?.credits ?? '—')} icon="flash-outline" />
          <StatCard label={t('plan')} value={capitalize(profile?.plan ?? 'free')} icon="ribbon-outline" />
        </View>
      )}

      {referral ? (
        <Pressable
          onPress={onInvite}
          style={({ pressed }) => [styles.inviteCard, pressed && styles.inviteCardPressed]}
        >
          <View style={styles.inviteIcon}>
            <Ionicons name="gift-outline" size={22} color={brand.accent} />
          </View>
          <View style={styles.inviteText}>
            <Text style={styles.inviteTitle}>{t('inviteTitle')}</Text>
            <Text style={styles.inviteSub}>
              {referral.count > 0
                ? t('inviteSubActive').replace('{count}', String(referral.count)).replace('{earned}', String(referral.creditsEarned))
                : t('inviteSubIdle')}
            </Text>
          </View>
          <Ionicons name="share-outline" size={20} color={brand.accent} />
        </Pressable>
      ) : null}

      <View style={styles.group}>
        <LinkRow
          icon="add-circle-outline"
          label={t('buildNewApp')}
          onPress={() => router.push('/new')}
        />
        <View style={styles.divider} />
        {/* Buy credits via Google Play Billing (RevenueCat) — compliant in-app
            purchase, no external-payment steering. The /paywall screen itself
            shows a calm "install the app" notice in Expo Go where IAP is off. */}
        <LinkRow
          icon="flash-outline"
          label={t('buyCredits')}
          onPress={() => router.push('/paywall')}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="language-outline"
          label={t('language')}
          onPress={() => setLangOpen(true)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="notifications-outline"
          label="Notification Preferences"
          onPress={() => router.push('/notification-preferences' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="storefront-outline"
          label="Marketplace"
          onPress={() => router.push('/marketplace' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="gift-outline"
          label="Affiliate"
          onPress={() => router.push('/affiliate' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="key-outline"
          label="API & MCP"
          onPress={() => router.push('/api-keys' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="lock-closed-outline"
          label="Secrets"
          onPress={() => router.push('/secrets' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="logo-github"
          label="GitHub"
          onPress={() => router.push('/github-settings' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="shield-checkmark-outline"
          label="Security"
          onPress={() => router.push('/security-settings' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="help-buoy-outline"
          label="Ask Wyberman"
          onPress={() => router.push('/help' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="help-circle-outline"
          label={t('helpSupport')}
          onPress={() => Linking.openURL('https://wyberai.com/contact')}
        />
        <View style={styles.divider} />
        {/* In-app reporting path for objectionable content (App Store 1.2 /
            Play UGC). Published apps also carry a Report control on the web. */}
        <LinkRow
          icon="flag-outline"
          label={t('reportContent')}
          onPress={() =>
            Linking.openURL(
              'mailto:hello@wyberai.com?subject=Report%20content&body=Please%20describe%20the%20app%20or%20content%20you%27re%20reporting%20(a%20link%20helps):%0A%0A',
            )
          }
        />
        <View style={styles.divider} />
        <LinkRow
          icon="document-lock-outline"
          label="Privacy Policy"
          // `/privacy` isn't reachable from typed-routes' static sitemap scan
          // (react-native-webview has no web bundle target), so it never lands
          // in the generated route union even though the native route works fine.
          onPress={() => router.push('/privacy' as Href)}
        />
        <View style={styles.divider} />
        <LinkRow
          icon="document-text-outline"
          label="Terms of Service"
          onPress={() => router.push('/privacy?doc=terms' as Href)}
        />
      </View>

      {activity.length > 0 ? (
        <View style={styles.group}>
          <Text style={styles.activityHeader}>{t('creditActivity')}</Text>
          {activity.map((ev, i) => (
            <View key={ev.id}>
              {i > 0 ? <View style={styles.divider} /> : null}
              <ActivityRow ev={ev} />
            </View>
          ))}
        </View>
      ) : null}

      <Text style={styles.disclosure}>{t('disclosure')}</Text>

      <Pressable
        onPress={signOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Ionicons name="log-out-outline" size={18} color={brand.danger} />
        <Text style={styles.signOutText}>{t('signOut')}</Text>
      </Pressable>

      <BottomSheet
        visible={langOpen}
        title={t('chooseLanguage')}
        onClose={() => setLangOpen(false)}
        actions={LOCALES.map((l) => ({
          icon: l === locale ? 'checkmark-circle' : ('ellipse-outline' as const),
          label: LOCALE_LABEL[l],
          tint: l === locale ? brand.accent : brand.textFaint,
          onPress: () => setLocale(l),
        }))}
      />

      <Pressable onPress={onDeleteAccount} disabled={deleting} hitSlop={8} style={styles.deleteAccount}>
        {deleting ? (
          <ActivityIndicator color={brand.textFaint} />
        ) : (
          <Text style={styles.deleteAccountText}>{t('deleteAccount')}</Text>
        )}
      </Pressable>

      <Text style={styles.version}>{`WyberAi · v${Constants.expoConfig?.version ?? '?'}`}</Text>
    </ScrollView>
  );
}

function StatCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: keyof typeof Ionicons.glyphMap;
}) {
  return (
    <View style={styles.stat}>
      <Ionicons name={icon} size={18} color={brand.accent} />
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

function LinkRow({
  icon,
  label,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && styles.linkRowPressed]}
    >
      <Ionicons name={icon} size={20} color={brand.textMuted} />
      <Text style={styles.linkLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={brand.textFaint} />
    </Pressable>
  );
}

// "topup:play:GPA.1234…" → "Credit pack purchase"; "build" → "App build"; etc.
function describeReason(
  reason: string,
  t: ReturnType<typeof useT<typeof ACCOUNT_STRINGS.en>>,
): { label: string; icon: keyof typeof Ionicons.glyphMap } {
  const r = reason.toLowerCase();
  if (r.startsWith('topup')) return { label: t('reasonCreditPack'), icon: 'card-outline' };
  if (r.includes('refund')) return { label: t('reasonRefund'), icon: 'arrow-undo-outline' };
  if (r.includes('referral')) return { label: t('reasonReferral'), icon: 'gift-outline' };
  if (r.includes('plan')) return { label: t('reasonPlanMode'), icon: 'map-outline' };
  if (r.includes('edit')) return { label: t('reasonEdit'), icon: 'create-outline' };
  if (r.includes('build') || r.includes('generat')) return { label: t('reasonBuild'), icon: 'sparkles-outline' };
  if (r.includes('preview-access')) return { label: 'Preview shared', icon: 'phone-portrait-outline' };
  return { label: reason.slice(0, 40) || t('reasonOther'), icon: 'swap-horizontal-outline' };
}

function ActivityRow({ ev }: { ev: CreditEvent }) {
  const t = useT(ACCOUNT_STRINGS);
  const { label, icon } = describeReason(ev.reason, t);
  const positive = ev.delta > 0;
  const date = new Date(ev.createdAt);
  const when = `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
  return (
    <View style={styles.activityRow}>
      <Ionicons name={icon} size={18} color={positive ? brand.success : brand.textMuted} />
      <View style={styles.activityText}>
        <Text style={styles.activityLabel}>{label}</Text>
        <Text style={styles.activityWhen}>{when}</Text>
      </View>
      <Text style={[styles.activityDelta, positive ? styles.deltaPlus : styles.deltaMinus]}>
        {positive ? '+' : '−'}
        {Math.abs(ev.delta).toLocaleString()}
      </Text>
    </View>
  );
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', gap: space.md, marginTop: space.sm },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: radius.pill,
    backgroundColor: brand.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: { color: brand.onAccent, fontSize: 24, fontWeight: '700' },
  headerText: { flex: 1 },
  name: { color: brand.text, fontSize: 20, fontFamily: font.display },
  email: { color: brand.textMuted, fontSize: 14, marginTop: 2 },
  statRow: { flexDirection: 'row', gap: space.md },
  stat: {
    flex: 1,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.xs,
  },
  statValue: { color: brand.text, fontSize: 22, fontWeight: '700', marginTop: space.xs },
  statLabel: { color: brand.textFaint, fontSize: 12 },
  inviteCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: 'rgba(14,165,233,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.3)',
    borderRadius: radius.lg,
    padding: space.lg,
  },
  inviteCardPressed: { backgroundColor: 'rgba(14,165,233,0.14)', transform: [{ scale: 0.97 }] },
  inviteIcon: {
    width: 40,
    height: 40,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,165,233,0.16)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  inviteText: { flex: 1, gap: 2 },
  inviteTitle: { color: brand.text, fontSize: 15, fontWeight: '700' },
  inviteSub: { color: brand.textMuted, fontSize: 12.5 },
  group: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  linkRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  linkRowPressed: { backgroundColor: brand.surfaceAlt },
  linkLabel: { flex: 1, color: brand.text, fontSize: 15, fontWeight: '500' },
  divider: { height: 1, backgroundColor: brand.border, marginLeft: space.lg + 20 + space.md },
  signOut: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.md + 2,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
  },
  signOutPressed: { backgroundColor: brand.surfaceAlt },
  signOutText: { color: brand.danger, fontSize: 15, fontWeight: '600' },
  deleteAccount: { alignItems: 'center', paddingVertical: space.sm },
  deleteAccountText: { color: brand.danger, fontSize: 13, fontWeight: '500' },
  disclosure: {
    color: brand.textFaint,
    fontSize: 12,
    lineHeight: 17,
    textAlign: 'center',
    marginTop: -space.sm,
  },
  version: { color: brand.textFaint, fontSize: 12, textAlign: 'center', marginTop: space.sm },
  activityHeader: {
    color: brand.textFaint,
    fontSize: 11,
    fontWeight: '800',
    letterSpacing: 1,
    textTransform: 'uppercase',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.xs,
  },
  activityRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg, paddingVertical: space.md },
  activityText: { flex: 1, gap: 1 },
  activityLabel: { color: brand.text, fontSize: 14, fontWeight: '500' },
  activityWhen: { color: brand.textFaint, fontSize: 11.5 },
  activityDelta: { fontSize: 14, fontWeight: '800' },
  deltaPlus: { color: brand.success },
  deltaMinus: { color: brand.textMuted },
});
