import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter, type Href } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/ctx/session';
import { supabase } from '@/lib/supabase';
import { brand, font, radius, space } from '@/lib/theme';

// Native TOTP enrollment now lives at /mfa-setup (QR via react-native-qrcode-svg
// + supabase.auth.mfa.* directly, same as web's TwoFactorPanel) — this screen
// just surfaces status and links to it, matching the LinkRow-to-detail-screen
// pattern used everywhere else in the app.
//
// Status reads profiles.mfa_enabled, NOT supabase.auth.mfa.listFactors() — the
// login-time 2FA gate (src/proxy.ts on web) is keyed strictly on that column,
// which is only set once recovery codes are generated after enrollment. A
// verified TOTP factor can exist with that column still false (enrollment
// interrupted before recovery codes finished) — reading listFactors() here
// would show "Enabled" for an account that isn't actually gated at login.
export default function SecuritySettingsScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);

  const load = useCallback(() => {
    if (!user) return;
    // Supabase's query builder is only a PromiseLike (thenable), not a real
    // Promise — its own .then() return type doesn't guarantee .catch(),
    // so wrap it in Promise.resolve() first to chain one safely.
    Promise.resolve(supabase.from('profiles').select('mfa_enabled').eq('id', user.id).maybeSingle())
      .then(({ data }) => setMfaEnabled(!!data?.mfa_enabled))
      .catch(() => setMfaEnabled(null));
  }, [user]);

  useFocusEffect(load);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'Security' }} />
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.rowText}>
            <Text style={styles.label}>Two-factor authentication</Text>
            <Text style={styles.hint}>
              {mfaEnabled === null ? 'Checking…' : mfaEnabled ? 'Enabled on your account' : 'Not enabled'}
            </Text>
          </View>
          {mfaEnabled === null ? (
            <ActivityIndicator color={brand.accent} />
          ) : (
            <Ionicons
              name={mfaEnabled ? 'shield-checkmark' : 'shield-outline'}
              size={22}
              color={mfaEnabled ? brand.success : brand.textFaint}
            />
          )}
        </View>
      </View>

      <Pressable style={styles.actionBtn} onPress={() => router.push('/mfa-setup' as Href)}>
        <Text style={styles.actionText}>{mfaEnabled ? 'Manage 2FA' : 'Set up 2FA'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brand.bg, padding: space.lg, gap: space.lg },
  card: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: space.lg,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  rowText: { flex: 1, gap: 2 },
  label: { color: brand.text, fontSize: 15, fontFamily: font.displayMedium },
  hint: { color: brand.textMuted, fontSize: 13 },
  actionBtn: {
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  actionText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
});
