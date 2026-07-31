import { useEffect, useState } from 'react';
import { ActivityIndicator, Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/ctx/session';
import { getGithubAccountStatus } from '@/lib/api';
import { brand, font, radius, space } from '@/lib/theme';

// Connecting GitHub is a GitHub OAuth flow (src/app/api/auth/github + callback
// on web, which writes to the `github_connections` table) — there's no native
// equivalent yet, so this screen is read-only status + a hand-off to web,
// same scope boundary as the build screen's "Push to GitHub".
export default function GithubSettingsScreen() {
  const { user } = useSession();
  const [connected, setConnected] = useState<boolean | null>(null);

  useEffect(() => {
    if (!user) return;
    getGithubAccountStatus().then(setConnected);
  }, [user]);

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'GitHub' }} />
      <View style={styles.card}>
        <View style={styles.row}>
          <Ionicons name="logo-github" size={22} color={brand.text} />
          <View style={styles.rowText}>
            <Text style={styles.label}>{connected === null ? 'Checking…' : connected ? 'Connected' : 'Not connected'}</Text>
            <Text style={styles.hint}>
              {connected
                ? 'Push builds straight to a repo from the build screen tools menu.'
                : 'Connect GitHub from the web editor to push your builds to a repo.'}
            </Text>
          </View>
          {connected !== null ? (
            <Ionicons name={connected ? 'checkmark-circle' : 'ellipse-outline'} size={20} color={connected ? brand.success : brand.textFaint} />
          ) : (
            <ActivityIndicator color={brand.accent} />
          )}
        </View>
      </View>

      {!connected ? (
        <Pressable style={styles.actionBtn} onPress={() => Linking.openURL('https://wyberai.com/settings?tab=github')}>
          <Text style={styles.actionText}>Connect on web</Text>
        </Pressable>
      ) : null}
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
  hint: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18 },
  actionBtn: {
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
  },
  actionText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
});
