import { useEffect, useState } from 'react';
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
import { brand, font, radius, space } from '@/lib/theme';

export default function Paywall() {
  const { user } = useSession();
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
        setPackages(pkgs);
        setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [user?.id]);

  async function onBuy(pkg: PurchasesPackage) {
    setBusyId(pkg.identifier);
    const result = await purchasePackage(pkg);
    setBusyId(null);
    if (result.ok) {
      Alert.alert(
        'You’re upgraded 🎉',
        'Your credits will update in a moment.',
        [{ text: 'Done', onPress: () => router.back() }],
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
      Alert.alert(r.isPro ? 'Purchases restored' : 'Nothing to restore');
    } else {
      Alert.alert('Restore failed', r.error ?? 'Try again later.');
    }
  }

  const unavailable = !isIapAvailable();

  return (
    <>
      <Stack.Screen options={{ title: 'Upgrade', presentation: 'modal', headerBackTitle: 'Close' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <Ionicons name="rocket" size={34} color={brand.accent} />
          <Text style={styles.title}>Build more with WyberAi</Text>
          <Text style={styles.subtitle}>
            Upgrade for more monthly credits — build and edit more apps, faster.
          </Text>
        </View>

        {unavailable ? (
          <View style={styles.notice}>
            <Ionicons name="information-circle-outline" size={18} color={brand.textMuted} />
            <Text style={styles.noticeText}>
              In-app purchases are only available in the installed WyberAi app, not the Expo Go
              preview. Install the app to upgrade.
            </Text>
          </View>
        ) : loading ? (
          <ActivityIndicator color={brand.accent} style={{ marginTop: space.xl }} />
        ) : packages.length === 0 ? (
          <View style={styles.notice}>
            <Ionicons name="hourglass-outline" size={18} color={brand.textMuted} />
            <Text style={styles.noticeText}>
              Plans aren’t available yet. Please check back shortly.
            </Text>
          </View>
        ) : (
          packages.map((pkg) => (
            <Pressable
              key={pkg.identifier}
              onPress={() => onBuy(pkg)}
              disabled={busyId !== null}
              style={({ pressed }) => [styles.plan, pressed && styles.planPressed]}
            >
              <View style={styles.planText}>
                <Text style={styles.planTitle}>{pkg.product.title || pkg.identifier}</Text>
                {pkg.product.description ? (
                  <Text style={styles.planDesc}>{pkg.product.description}</Text>
                ) : null}
              </View>
              {busyId === pkg.identifier ? (
                <ActivityIndicator color={brand.accent} />
              ) : (
                <Text style={styles.planPrice}>{pkg.product.priceString}</Text>
              )}
            </Pressable>
          ))
        )}

        {!unavailable ? (
          <Pressable onPress={onRestore} hitSlop={8} style={styles.restore}>
            <Text style={styles.restoreText}>Restore purchases</Text>
          </Pressable>
        ) : null}

        <Text style={styles.fine}>
          Payment is charged to your store account. Subscriptions renew automatically unless
          cancelled at least 24 hours before the end of the period; manage or cancel in your store
          account settings.
        </Text>
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md },
  hero: { alignItems: 'center', gap: space.sm, marginTop: space.lg, marginBottom: space.md },
  title: { color: brand.text, fontSize: 24, fontFamily: font.display, letterSpacing: -0.4, textAlign: 'center' },
  subtitle: { color: brand.textMuted, fontSize: 15, lineHeight: 21, textAlign: 'center', paddingHorizontal: space.md },
  plan: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.md,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  planPressed: { backgroundColor: brand.surfaceAlt, borderColor: brand.accent },
  planText: { flex: 1, gap: 2 },
  planTitle: { color: brand.text, fontSize: 16, fontWeight: '700' },
  planDesc: { color: brand.textMuted, fontSize: 13, lineHeight: 18 },
  planPrice: { color: brand.accent, fontSize: 18, fontWeight: '700' },
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
  fine: { color: brand.textFaint, fontSize: 11, lineHeight: 16, marginTop: space.md, textAlign: 'center' },
});
