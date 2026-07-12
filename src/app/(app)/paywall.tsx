import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import type { PurchasesPackage } from 'react-native-purchases';
import { useSession } from '@/ctx/session';
import {
  configureIap,
  getOfferingPackages,
  isIapAvailable,
  purchasePackage,
  restorePurchases,
} from '@/lib/iap';
import { tap, success as hapticSuccess } from '@/lib/haptics';
import { brand, font, radius, space } from '@/lib/theme';

// Pack marketing metadata, matched to a store product by the credit amount in
// its identifier (e.g. wyber_credits_600). Prices ALWAYS come from the store —
// this only adds the framing the raw catalog can't carry.
const PACK_META = [
  {
    match: /2000/,
    credits: 2000,
    name: 'Studio',
    tagline: 'Ship a portfolio of apps',
    builds: '~66 app builds',
    badge: 'BEST VALUE',
    icon: 'rocket' as const,
  },
  {
    match: /600/,
    credits: 600,
    name: 'Builder',
    tagline: 'For serious side projects',
    builds: '~20 app builds',
    badge: 'MOST POPULAR',
    icon: 'hammer' as const,
  },
  {
    match: /200/,
    credits: 200,
    name: 'Starter',
    tagline: 'Get your first apps live',
    builds: '~6 app builds',
    badge: null,
    icon: 'flash' as const,
  },
];

function metaFor(pkg: PurchasesPackage) {
  const key = `${pkg.identifier} ${pkg.product.identifier}`;
  return PACK_META.find((m) => m.match.test(key)) ?? null;
}

/** Sort packages big-first so BEST VALUE anchors the top (price anchoring). */
function sortPackages(pkgs: PurchasesPackage[]): PurchasesPackage[] {
  return [...pkgs].sort((a, b) => (metaFor(b)?.credits ?? 0) - (metaFor(a)?.credits ?? 0));
}

export default function Paywall() {
  const { user, credits, refreshCredits } = useSession();
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [packages, setPackages] = useState<PurchasesPackage[]>([]);
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      if (user?.id) await configureIap(user.id);
      const pkgs = await getOfferingPackages();
      if (active) {
        setPackages(sortPackages(pkgs));
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function onBuy(pkg: PurchasesPackage) {
    tap();
    setBusyId(pkg.identifier);
    const result = await purchasePackage(pkg);
    setBusyId(null);
    if (result.ok) {
      hapticSuccess();
      // Credits are granted server-side by the RevenueCat webhook (async,
      // usually seconds). Poll so the new balance appears without leaving.
      refreshCredits();
      [1500, 3500, 6000].forEach((ms) => setTimeout(refreshCredits, ms));
      Alert.alert(
        'Purchase complete 🎉',
        'Your credits are being added now — they’ll appear in a moment.',
        [{ text: 'Start building', onPress: () => router.back() }],
      );
    } else if (result.cancelled) {
      // user backed out — say nothing
    } else {
      Alert.alert('Purchase failed', result.error);
    }
  }

  async function onRestore() {
    const r = await restorePurchases();
    if (r.ok) {
      refreshCredits();
      Alert.alert(r.isPro ? 'Purchases restored' : 'Nothing to restore');
    } else {
      Alert.alert('Restore failed', r.error ?? 'Try again later.');
    }
  }

  const unavailable = !isIapAvailable();
  const popularId = useMemo(
    () => packages.find((p) => metaFor(p)?.badge === 'MOST POPULAR')?.identifier ?? null,
    [packages],
  );

  return (
    <>
      <Stack.Screen options={{ title: 'Get credits', presentation: 'modal', headerBackTitle: 'Close' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        {/* Hero */}
        <View style={styles.heroWrap}>
          <LinearGradient
            colors={['rgba(14,165,233,0.22)', 'rgba(14,165,233,0.05)', 'transparent']}
            style={StyleSheet.absoluteFill}
          />
          <View style={styles.heroIcon}>
            <Ionicons name="flash" size={26} color={brand.accent} />
          </View>
          <Text style={styles.title}>Fuel your next app</Text>
          <Text style={styles.subtitle}>
            Credits power every build. One balance, shared across web and mobile — and they never
            expire.
          </Text>
          {credits !== null ? (
            <View style={styles.balanceChip}>
              <Ionicons name="wallet-outline" size={13} color={brand.textMuted} />
              <Text style={styles.balanceText}>
                Current balance: <Text style={styles.balanceNum}>{credits.toLocaleString()}</Text>
              </Text>
            </View>
          ) : null}
        </View>

        {unavailable ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={brand.textMuted} />
            <Text style={styles.noticeText}>
              In-app purchases are only available in the installed WyberAi app, not this preview.
              Install the app from Google Play to buy credits.
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={brand.accent} style={{ marginTop: space.xl }} />
        ) : packages.length === 0 ? (
          <View style={styles.notice}>
            <Ionicons name="hourglass-outline" size={18} color={brand.textMuted} />
            <Text style={styles.noticeText}>
              Credit packs aren’t available in your region yet. Please check back shortly.
            </Text>
          </View>
        ) : (
          packages.map((pkg) => {
            const meta = metaFor(pkg);
            const highlighted = pkg.identifier === popularId;
            const perBuild =
              meta && pkg.product.price > 0
                ? `${pkg.product.currencyCode === 'INR' ? '₹' : ''}${(
                    (pkg.product.price / meta.credits) * 30
                  ).toFixed(pkg.product.currencyCode === 'INR' ? 0 : 2)} / app build`
                : null;
            return (
              <Pressable
                key={pkg.identifier}
                onPress={() => onBuy(pkg)}
                disabled={busyId !== null}
                style={({ pressed }) => [
                  styles.plan,
                  highlighted && styles.planHighlight,
                  pressed && styles.planPressed,
                ]}
              >
                {meta?.badge ? (
                  <View style={[styles.badge, highlighted && styles.badgePopular]}>
                    <Text style={styles.badgeText}>{meta.badge}</Text>
                  </View>
                ) : null}
                <View style={styles.planRow}>
                  <View style={[styles.planIcon, highlighted && styles.planIconHl]}>
                    <Ionicons name={meta?.icon ?? 'flash'} size={20} color={highlighted ? brand.onAccent : brand.accent} />
                  </View>
                  <View style={styles.planText}>
                    <Text style={styles.planTitle}>
                      {meta ? `${meta.credits.toLocaleString()} credits` : pkg.product.title || pkg.identifier}
                    </Text>
                    <Text style={styles.planDesc}>
                      {meta ? `${meta.name} · ${meta.tagline}` : pkg.product.description}
                    </Text>
                    {meta ? <Text style={styles.planBuilds}>{meta.builds}</Text> : null}
                  </View>
                  <View style={styles.planPriceCol}>
                    {busyId === pkg.identifier ? (
                      <ActivityIndicator color={brand.accent} />
                    ) : (
                      <>
                        <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
                        {perBuild ? <Text style={styles.perBuild}>{perBuild}</Text> : null}
                      </>
                    )}
                  </View>
                </View>
              </Pressable>
            );
          })
        )}

        {/* What credits buy */}
        <View style={styles.costCard}>
          <Text style={styles.costTitle}>What credits buy</Text>
          <CostRow icon="sparkles" label="New app, built from your prompt" cost="30" />
          <CostRow icon="create-outline" label="Edit or new feature" cost="2–5" />
          <CostRow icon="map-outline" label="Plan Mode blueprint" cost="5" />
          <CostRow icon="color-palette-outline" label="Themes · publish · preview" cost="Free" />
        </View>

        {/* Trust row */}
        <View style={styles.trustRow}>
          <Trust icon="logo-google-playstore" label="Google Play billing" />
          <Trust icon="infinite-outline" label="Never expire" />
          <Trust icon="sync-outline" label="Web + mobile" />
        </View>

        {!unavailable ? (
          <Pressable onPress={onRestore} hitSlop={8} style={styles.restore}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </Pressable>
        ) : null}

        <Text style={styles.fine}>
          One-time purchase charged to your Google Play account. Credits are added to your WyberAi
          account and work on web and mobile. No subscription, no auto-renewal.
        </Text>
      </ScrollView>
    </>
  );
}

function CostRow({ icon, label, cost }: { icon: keyof typeof Ionicons.glyphMap; label: string; cost: string }) {
  return (
    <View style={styles.costRow}>
      <Ionicons name={icon} size={16} color={brand.accent} />
      <Text style={styles.costLabel}>{label}</Text>
      <Text style={styles.costValue}>{cost}</Text>
    </View>
  );
}

function Trust({ icon, label }: { icon: keyof typeof Ionicons.glyphMap; label: string }) {
  return (
    <View style={styles.trust}>
      <Ionicons name={icon} size={16} color={brand.textMuted} />
      <Text style={styles.trustText}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  heroWrap: {
    alignItems: 'center',
    gap: space.sm,
    paddingVertical: space.xl,
    paddingHorizontal: space.md,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  heroIcon: {
    width: 52,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: 'rgba(14,165,233,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(14,165,233,0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { color: brand.text, fontSize: 26, fontFamily: font.display, letterSpacing: -0.5, textAlign: 'center' },
  subtitle: { color: brand.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center', paddingHorizontal: space.md },
  balanceChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.pill,
    marginTop: space.xs,
  },
  balanceText: { color: brand.textMuted, fontSize: 12 },
  balanceNum: { color: brand.text, fontWeight: '700' },
  plan: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  planHighlight: {
    borderColor: brand.accent,
    shadowColor: brand.accent,
    shadowOpacity: 0.35,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 0 },
    elevation: 6,
  },
  planPressed: { backgroundColor: brand.surfaceAlt },
  badge: {
    position: 'absolute',
    top: -9,
    right: space.md,
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: space.sm + 2,
    paddingVertical: 2,
    borderRadius: radius.pill,
  },
  badgePopular: { backgroundColor: brand.accent, borderColor: brand.accent },
  badgeText: { color: brand.text, fontSize: 10, fontWeight: '800', letterSpacing: 0.6 },
  planRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  planIcon: {
    width: 42,
    height: 42,
    borderRadius: radius.md,
    backgroundColor: 'rgba(14,165,233,0.12)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  planIconHl: { backgroundColor: brand.accent },
  planText: { flex: 1, gap: 2 },
  planTitle: { color: brand.text, fontSize: 17, fontWeight: '800', letterSpacing: -0.2 },
  planDesc: { color: brand.textMuted, fontSize: 12.5, lineHeight: 17 },
  planBuilds: { color: brand.accent, fontSize: 12, fontWeight: '600', marginTop: 1 },
  planPriceCol: { alignItems: 'flex-end', gap: 2, minWidth: 76 },
  planPrice: { color: brand.text, fontSize: 18, fontWeight: '800' },
  perBuild: { color: brand.textFaint, fontSize: 10.5 },
  costCard: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.md,
    marginTop: space.xs,
  },
  costTitle: { color: brand.textFaint, fontSize: 11, fontWeight: '800', letterSpacing: 1, textTransform: 'uppercase' },
  costRow: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  costLabel: { color: brand.text, fontSize: 13.5, flex: 1 },
  costValue: { color: brand.textMuted, fontSize: 13, fontWeight: '700' },
  trustRow: { flexDirection: 'row', justifyContent: 'center', gap: space.lg, marginTop: space.xs },
  trust: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  trustText: { color: brand.textMuted, fontSize: 11.5 },
  restore: { alignItems: 'center', paddingVertical: space.md },
  restoreText: { color: brand.accent, fontSize: 14, fontWeight: '600' },
  notice: {
    flexDirection: 'row',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    marginTop: space.sm,
  },
  noticeText: { color: brand.textMuted, fontSize: 13, lineHeight: 19, flex: 1 },
  fine: { color: brand.textFaint, fontSize: 11, lineHeight: 16, marginTop: space.sm, textAlign: 'center' },
});
