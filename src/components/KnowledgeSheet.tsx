import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Modal, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { API_BASE } from '@/lib/api';
import { supabase } from '@/lib/supabase';
import { brand, font, radius, space } from '@/lib/theme';

async function accessToken(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}

// Project-level context the AI reads on every build/edit — same field as the
// web editor's Knowledge tab (GET/POST /api/projects/knowledge).
export function KnowledgeSheet({
  visible,
  onClose,
  projectId,
}: {
  visible: boolean;
  onClose: () => void;
  projectId?: string;
}) {
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!projectId) return;
    setLoading(true);
    setLoadError(null);
    try {
      const token = await accessToken();
      const res = await fetch(`${API_BASE}/api/projects/knowledge?projectId=${projectId}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) {
        // A non-2xx (401/500/etc.) is still valid JSON, so `data.knowledge`
        // would silently be `undefined` → an empty editor indistinguishable
        // from "nothing saved yet". Saving from there would overwrite real
        // server content with a blank slate — surface the failure instead.
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Couldn't load Knowledge (${res.status})`);
      }
      const data = await res.json();
      setText(data.knowledge || '');
    } catch (e) {
      setLoadError((e as Error).message || "Couldn't load Knowledge — check your connection.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    if (!visible || !projectId) return;
    // Reset transient UI state for a fresh open — legitimate prop-driven
    // reset, not a derivation the compiler's generic check can see through.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSaved(false);
    load();
  }, [visible, projectId, load]);

  async function save() {
    if (!projectId || saving) return;
    setSaving(true);
    setSaved(false);
    try {
      const token = await accessToken();
      const res = await fetch(`${API_BASE}/api/projects/knowledge`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        body: JSON.stringify({ projectId, knowledge: text }),
      });
      // fetch only rejects on a network failure, never on a non-2xx status —
      // this used to show "Saved ✓" even on a 401/500 with nothing written.
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Save failed (${res.status})`);
      }
      setSaved(true);
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal visible={visible} animationType="slide" onRequestClose={onClose} presentationStyle="pageSheet">
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>Knowledge</Text>
          <Pressable onPress={onClose} hitSlop={8}>
            <Ionicons name="close" size={22} color={brand.textMuted} />
          </Pressable>
        </View>
        <Text style={styles.subtitle}>
          Context the AI reads on every build and edit — brand voice, business rules, things it should never forget.
        </Text>
        {loading ? (
          <View style={styles.loading}>
            <ActivityIndicator color={brand.accent} />
          </View>
        ) : loadError ? (
          <View style={styles.loading}>
            <Ionicons name="alert-circle-outline" size={28} color={brand.danger} />
            <Text style={styles.errorText}>{loadError}</Text>
            <Pressable style={styles.retryBtn} onPress={load}>
              <Text style={styles.retryText}>Try again</Text>
            </Pressable>
          </View>
        ) : (
          <TextInput
            style={styles.input}
            multiline
            textAlignVertical="top"
            placeholder="e.g. Always refer to the company as 'Acme Robotics'. Prices are in EUR. Never suggest social login."
            placeholderTextColor={brand.textFaint}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setSaved(false);
            }}
          />
        )}
        <Pressable style={styles.saveBtn} onPress={save} disabled={saving || loading || !!loadError}>
          {saving ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.saveText}>{saved ? 'Saved ✓' : 'Save'}</Text>}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: brand.bg, padding: space.lg },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: space.sm },
  title: { color: brand.text, fontSize: 18, fontFamily: font.display },
  subtitle: { color: brand.textMuted, fontSize: 13, lineHeight: 19, marginBottom: space.md },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: space.sm },
  errorText: { color: brand.textMuted, fontSize: 13.5, textAlign: 'center', paddingHorizontal: space.xl },
  retryBtn: { paddingVertical: space.sm, paddingHorizontal: space.lg },
  retryText: { color: brand.accent, fontSize: 14, fontWeight: '700' },
  input: {
    flex: 1,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: space.md,
    color: brand.text,
    fontSize: 14,
    lineHeight: 20,
  },
  saveBtn: {
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: space.md,
    minHeight: 48,
  },
  saveText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
});
