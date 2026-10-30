import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { fetchLiveErrors, markNotificationRead, type LiveErrorAlert } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// "Visitors hit an error on your live app" — reads the owner's unread
// app_error alerts (/api/app-errors, fed by the beacon in every published app).
// "Fix it" hands a ready-written prompt to the builder, where it is a normal,
// visible edit priced like any other. Republish afterwards so visitors get it.

function ago(iso?: string): string {
  if (!iso) return '';
  const m = Math.max(1, Math.round((Date.now() - new Date(iso).getTime()) / 60000));
  return m < 60 ? `${m}m ago` : m < 1440 ? `${Math.round(m / 60)}h ago` : `${Math.round(m / 1440)}d ago`;
}

export function LiveErrorsBanner({ projectId, onFix }: { projectId: string; onFix: (prompt: string) => void }) {
  const [alerts, setAlerts] = useState<LiveErrorAlert[]>([]);

  const load = useCallback(() => {
    fetchLiveErrors(projectId).then(setAlerts);
  }, [projectId]);

  useEffect(() => {
    load();
    const t = setInterval(load, 60_000);
    return () => clearInterval(t);
  }, [load]);

  if (!alerts.length) return null;

  const top = alerts[0];
  const { message, stack, count = 1, lastSeen } = top.payload;

  function clear() {
    alerts.forEach((a) => markNotificationRead(a.id));
    setAlerts([]);
  }

  function fix() {
    tap();
    // A stack's first line usually repeats the message — keep only the frames.
    const head = String(stack || '').split('\n').filter((l) => l.trim() && !message.includes(l.trim())).slice(0, 4).join('\n');
    onFix(
      `Fix this error that visitors hit on my live app (${count}×):\n\n${message}${head ? `\n\n${head}` : ''}\n\nFind the root cause and fix it without changing anything unrelated. (The stack is from the minified live build, so treat it as a hint.)`,
    );
    clear();
  }

  return (
    <View style={styles.wrap}>
      <View style={styles.head}>
        <View style={styles.dot} />
        <Text style={styles.title}>Visitors hit an error on your live app</Text>
        <Text style={styles.meta}>{count > 1 ? `${count}× · ` : ''}{ago(lastSeen || top.created_at)}</Text>
      </View>
      <Text style={styles.msg} numberOfLines={3}>{message}</Text>
      <View style={styles.actions}>
        <Pressable onPress={fix} style={styles.fix}><Text style={styles.fixText}>Fix it</Text></Pressable>
        <Pressable onPress={() => { tap(); clear(); }} hitSlop={8}><Text style={styles.meta}>Dismiss</Text></Pressable>
        {alerts.length > 1 ? <Text style={styles.meta}>+{alerts.length - 1} other</Text> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(239,68,68,0.3)', backgroundColor: 'rgba(239,68,68,0.06)' },
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: brand.danger },
  title: { color: brand.text, fontSize: 13.5, fontWeight: '700', flex: 1 },
  meta: { color: brand.textMuted, fontSize: 11.5 },
  msg: { color: '#fca5a5', fontSize: 12, backgroundColor: 'rgba(239,68,68,0.08)', borderRadius: radius.sm, padding: space.sm },
  actions: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  fix: { backgroundColor: brand.danger, borderRadius: radius.sm + 1, paddingHorizontal: space.md, paddingVertical: 6 },
  fixText: { color: '#fff', fontSize: 12.5, fontWeight: '700' },
});
