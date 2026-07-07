import { useCallback, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect, useRouter } from 'expo-router';
import { useSession } from '@/ctx/session';
import { supabase } from '@/lib/supabase';
import { deleteAccount } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import type { Profile } from '@/lib/types';
import { brand, font, radius, space } from '@/lib/theme';

// The paywall only appears once IAP is real (RevenueCat products exist + the
// credit webhook is deployed). Off by default so "Upgrade" is never a dead-end.
const ENABLE_IAP = process.env.EXPO_PUBLIC_ENABLE_IAP === 'true';

export default function AccountScreen() {
  const { user, signOut } = useSession();
  const router = useRouter();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);

  function onDeleteAccount() {
    Alert.alert(
      'Delete account?',
      'This permanently deletes your account, all your apps, and your data. This cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
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
          <StatCard label="Credits" value={String(profile?.credits ?? '—')} icon="flash-outline" />
          <StatCard label="Plan" value={capitalize(profile?.plan ?? 'free')} icon="ribbon-outline" />
        </View>
      )}

      <View style={styles.group}>
        <LinkRow
          icon="add-circle-outline"
          label="Build a new app"
          onPress={() => router.push('/new')}
        />
        <View style={styles.divider} />
        {/* Credits are bought on the web (Dodo) and shared across web + mobile —
            no in-app purchase, so no Play/App-Store cut. Opens the browser; on
            return, useFocusEffect above refreshes the balance. */}
        <LinkRow
          icon="flash-outline"
          label="Top up credits"
          onPress={() => Linking.openURL('https://wyberai.com/pricing')}
        />
        <View style={styles.divider} />
        {/* In-app paywall (RevenueCat) — shown only when IAP is live, so it's
            never a dead-end. Compliant on iOS + Play (their own billing). */}
        {ENABLE_IAP ? (
          <>
            <LinkRow
              icon="rocket-outline"
              label="Upgrade plan"
              onPress={() => router.push('/paywall')}
            />
            <View style={styles.divider} />
          </>
        ) : null}
        <LinkRow
          icon="help-circle-outline"
          label="Help & support"
          onPress={() => Linking.openURL('https://wyberai.com/contact')}
        />
      </View>

      <Pressable
        onPress={signOut}
        style={({ pressed }) => [styles.signOut, pressed && styles.signOutPressed]}
      >
        <Ionicons name="log-out-outline" size={18} color={brand.danger} />
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>

      <Pressable onPress={onDeleteAccount} disabled={deleting} hitSlop={8} style={styles.deleteAccount}>
        {deleting ? (
          <ActivityIndicator color={brand.textFaint} />
        ) : (
          <Text style={styles.deleteAccountText}>Delete account</Text>
        )}
      </Pressable>

      <Text style={styles.version}>WyberAi · v1.0.0</Text>
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
  version: { color: brand.textFaint, fontSize: 12, textAlign: 'center', marginTop: space.sm },
});
