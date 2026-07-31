import { useEffect, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack } from 'expo-router';
import { fetchNotificationPrefs, saveNotificationPrefs, type NotificationPrefs } from '@/lib/api';
import { brand, font, radius, space } from '@/lib/theme';

// Event types match the real values written by the web app's notify()/
// notifyPush() (src/lib/push.ts) — not invented names, so a toggle here
// actually controls something.
const EVENTS: { key: string; label: string; hint: string }[] = [
  { key: 'build_complete', label: 'Build complete', hint: 'Your app finished building and is ready to preview' },
  { key: 'published', label: 'Published', hint: 'Your project went live' },
  { key: 'credits_low', label: 'Low credits', hint: 'You’re running low and should top up' },
  { key: 'scheduled_agent_skipped', label: 'Scheduled agent skipped', hint: 'A scheduled AI Employee run was skipped for low credits' },
  { key: 'referral', label: 'Referral reward', hint: 'Someone joined with your invite link' },
  { key: 'weekly_digest', label: 'Weekly digest', hint: 'A weekly summary of what you built' },
];

export default function NotificationPreferencesScreen() {
  const [prefs, setPrefs] = useState<NotificationPrefs>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchNotificationPrefs().then((p) => {
      setPrefs(p);
      setLoading(false);
    });
  }, []);

  function toggle(key: string, value: boolean) {
    const previous = prefs;
    const next = { ...prefs, [key]: value };
    setPrefs(next);
    saveNotificationPrefs(next).catch(() => {
      // Best-effort — revert to the pre-toggle snapshot (not the closure's
      // `prefs`, which could be stale if a second toggle landed first) so the
      // switch never lies about server state.
      setPrefs(previous);
    });
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Notifications' }} />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={styles.group}>
            {EVENTS.map((e, i) => (
              <View key={e.key}>
                {i > 0 ? <View style={styles.divider} /> : null}
                <View style={styles.row}>
                  <View style={styles.rowText}>
                    <Text style={styles.label}>{e.label}</Text>
                    <Text style={styles.hint}>{e.hint}</Text>
                  </View>
                  <Switch
                    value={prefs[e.key] !== false}
                    onValueChange={(v) => toggle(e.key, v)}
                    trackColor={{ false: brand.border, true: brand.accent }}
                  />
                </View>
              </View>
            ))}
          </View>
        </ScrollView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { padding: space.lg },
  group: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg },
  rowText: { flex: 1, gap: 2 },
  label: { color: brand.text, fontSize: 15, fontFamily: font.displayMedium },
  hint: { color: brand.textFaint, fontSize: 12.5, lineHeight: 17 },
  divider: { height: 1, backgroundColor: brand.border, marginLeft: space.lg },
});
