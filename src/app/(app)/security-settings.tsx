import { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/ctx/session';
import { supabase } from '@/lib/supabase';
import { brand, font, radius, space } from '@/lib/theme';

// Native TOTP enrollment (QR + confirm code) is a meaningfully-sized native
// flow on its own — this screen surfaces status and hands the actual
// enable/disable to the web settings page in a modal, matching how GitHub
// connection (also OAuth, also web-only today) is handled.
export default function SecuritySettingsScreen() {
  const { user } = useSession();
  const [mfaEnabled, setMfaEnabled] = useState<boolean | null>(null);
  const [webviewOpen, setWebviewOpen] = useState(false);

  useEffect(() => {
    if (!user) return;
    supabase.from('profiles').select('mfa_enabled').eq('id', user.id).maybeSingle().then(({ data }) => {
      setMfaEnabled(!!(data as { mfa_enabled?: boolean } | null)?.mfa_enabled);
    });
  }, [user]);

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

      <Pressable style={styles.actionBtn} onPress={() => setWebviewOpen(true)}>
        <Text style={styles.actionText}>{mfaEnabled ? 'Manage 2FA' : 'Set up 2FA'}</Text>
      </Pressable>

      <Modal visible={webviewOpen} animationType="slide" onRequestClose={() => setWebviewOpen(false)} presentationStyle="pageSheet">
        <View style={styles.flex}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>Security settings</Text>
            <Pressable onPress={() => setWebviewOpen(false)} hitSlop={8}>
              <Ionicons name="close" size={22} color={brand.textMuted} />
            </Pressable>
          </View>
          <WebView source={{ uri: 'https://wyberai.com/settings?tab=security' }} style={styles.flex} />
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brand.bg, padding: space.lg, gap: space.lg },
  flex: { flex: 1, backgroundColor: brand.bg },
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
  modalHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.lg,
    borderBottomWidth: 1,
    borderBottomColor: brand.border,
  },
  modalTitle: { color: brand.text, fontSize: 17, fontFamily: font.display },
});
