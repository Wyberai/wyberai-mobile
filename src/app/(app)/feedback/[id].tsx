import { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import {
  deleteFeedback, fetchFeedback, resolveFeedback, setFeedbackMode, type FeedbackComment,
} from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

// Feedback — comments a client or teammate pinned on the published preview
// (/api/preview-comments). Turn the mode on, publish, share the link.

export default function FeedbackScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useToast();
  const [comments, setComments] = useState<FeedbackComment[]>([]);
  const [enabled, setEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showResolved, setShowResolved] = useState(false);

  const load = useCallback(() => {
    if (!id) return Promise.resolve();
    return fetchFeedback(id)
      .then((r) => { setComments(r.comments); setEnabled(r.enabled); })
      .catch(() => { /* best-effort */ })
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => { void load(); }, [load]);

  async function toggle(next: boolean) {
    if (!id) return;
    tap();
    setToggling(true);
    try {
      await setFeedbackMode(id, next);
      setEnabled(next);
    } catch (e) {
      showToast((e as Error).message);
    } finally {
      setToggling(false);
    }
  }

  async function setResolved(cid: string, resolved: boolean) {
    tap();
    setComments((prev) => prev.map((c) => (c.id === cid ? { ...c, resolved } : c)));
    resolveFeedback(cid, resolved).catch(() => { showToast('Could not save that'); load(); });
  }

  function remove(cid: string) {
    Alert.alert('Delete this comment?', undefined, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          setComments((prev) => prev.filter((c) => c.id !== cid));
          deleteFeedback(cid).catch(() => { showToast('Could not delete that'); load(); });
        },
      },
    ]);
  }

  const visible = comments.filter((c) => showResolved || !c.resolved);
  const openCount = comments.filter((c) => !c.resolved).length;

  return (
    <>
      <Stack.Screen options={{ title: 'Feedback' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
        <Text style={styles.lead}>Let a client or teammate pin comments right on your published app. They need no account.</Text>

        <View style={styles.modeRow}>
          <View style={{ flex: 1 }}>
            <Text style={styles.modeTitle}>Feedback mode</Text>
            <Text style={styles.hint}>{enabled ? 'On. The feedback button shows on your live app' : 'Off. No widget on your live app'}</Text>
          </View>
          <Switch value={enabled} onValueChange={toggle} disabled={toggling} trackColor={{ true: brand.accent, false: brand.border }} />
        </View>

        {enabled ? (
          <Text style={styles.note}>Publish (or republish) to activate the widget on the live link. Turn this off once the review is done; it is for a review link, not permanent UI.</Text>
        ) : null}

        <View style={styles.listHead}>
          <Text style={styles.sectionTitle}>{openCount} open</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
            <Text style={styles.hint}>Show resolved</Text>
            <Switch value={showResolved} onValueChange={setShowResolved} trackColor={{ true: brand.accent, false: brand.border }} />
          </View>
        </View>

        {loading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <Text style={styles.lead}>
            No feedback yet. {enabled ? 'Share your published link. Comments left there show up here.' : 'Turn on Feedback mode, then publish, to start collecting it.'}
          </Text>
        ) : (
          visible.map((c) => (
            <View key={c.id} style={[styles.card, c.resolved && { opacity: 0.55 }]}>
              <Text style={styles.body}>{c.body}</Text>
              <Text style={styles.hint}>{c.author_name || 'Anonymous'} · {c.page_path} · {new Date(c.created_at).toLocaleString()}</Text>
              <View style={{ flexDirection: 'row', gap: space.sm }}>
                <Pressable onPress={() => setResolved(c.id, !c.resolved)} style={[styles.btn, { flex: 1 }]}>
                  <Text style={styles.btnText}>{c.resolved ? 'Reopen' : 'Resolve'}</Text>
                </Pressable>
                <Pressable onPress={() => remove(c.id)} style={styles.btn}>
                  <Text style={[styles.btnText, { color: brand.danger }]}>Delete</Text>
                </Pressable>
              </View>
            </View>
          ))
        )}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xxl },
  lead: { color: brand.textMuted, fontSize: 13, lineHeight: 19 },
  hint: { color: brand.textFaint, fontSize: 11.5, lineHeight: 16 },
  modeRow: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  modeTitle: { color: brand.text, fontSize: 14, fontWeight: '600' },
  note: { color: brand.textMuted, fontSize: 12, lineHeight: 18, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: 'rgba(14,165,233,0.25)', backgroundColor: 'rgba(14,165,233,0.06)' },
  listHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sectionTitle: { color: brand.textMuted, fontSize: 11.5, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.6 },
  card: { gap: space.sm, padding: space.md, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  body: { color: brand.text, fontSize: 14, lineHeight: 20 },
  btn: { borderWidth: 1, borderColor: brand.border, borderRadius: radius.sm + 2, paddingVertical: 8, paddingHorizontal: space.md, alignItems: 'center' },
  btnText: { color: brand.textMuted, fontSize: 12.5, fontWeight: '700' },
});
