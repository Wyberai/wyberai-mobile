import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { connectSupabase, disconnectSupabase, fetchSupabaseConnection, type SupabaseConnection } from '@/lib/api';
import { tap, success } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// Mirrors the manual path of the web editor's Supabase connector: paste the
// project URL and anon key, validate them, save. (The OAuth "Sign in with
// Supabase" path is web-only for now: it needs a verified redirect round trip.)

export default function SupabaseConnectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [conn, setConn] = useState<SupabaseConnection>(null);
  const [loading, setLoading] = useState(true);
  const [url, setUrl] = useState('');
  const [anonKey, setAnonKey] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!id) return;
    setConn(await fetchSupabaseConnection(id));
    setLoading(false);
  }, [id]);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    load();
  }, [load]);

  async function connect() {
    if (!id || busy) return;
    if (!url.trim() || !anonKey.trim()) {
      setError('Both fields are required.');
      return;
    }
    tap();
    setBusy(true);
    setError('');
    try {
      await connectSupabase(id, url, anonKey.trim());
      success();
      setAnonKey('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  async function disconnect() {
    if (!id || busy) return;
    tap();
    setBusy(true);
    setError('');
    try {
      await disconnectSupabase(id);
      setUrl('');
      await load();
    } catch (e) {
      setError((e as Error).message);
    }
    setBusy(false);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Supabase', headerBackTitle: 'Back' }} />
      <Text style={styles.h}>Connect your Supabase</Text>
      {loading ? (
        <ActivityIndicator color={brand.accent} />
      ) : conn ? (
        <View style={styles.card}>
          <View style={styles.row}>
            <Ionicons name="checkmark-circle" size={18} color={brand.success} />
            <Text style={styles.ok}>Connected</Text>
          </View>
          <Text style={styles.mono}>{conn.url}</Text>
          <Pressable style={[styles.ghost, busy && styles.dim]} onPress={disconnect} disabled={busy}>
            <Text style={styles.ghostText}>{busy ? 'Disconnecting…' : 'Disconnect'}</Text>
          </Pressable>
        </View>
      ) : (
        <>
          <Text style={styles.body}>
            In your Supabase dashboard open Project Settings, then API. Copy the Project URL and the anon public key.
          </Text>
          <TextInput
            style={styles.input}
            placeholder="https://yourproject.supabase.co"
            placeholderTextColor={brand.textFaint}
            value={url}
            onChangeText={setUrl}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
          />
          <TextInput
            style={styles.input}
            placeholder="anon public key"
            placeholderTextColor={brand.textFaint}
            value={anonKey}
            onChangeText={setAnonKey}
            autoCapitalize="none"
            autoCorrect={false}
            secureTextEntry
          />
          <Pressable style={[styles.primary, busy && styles.dim]} onPress={connect} disabled={busy}>
            {busy ? <ActivityIndicator color={brand.onAccent} /> : <Ionicons name="link" size={16} color={brand.onAccent} />}
            <Text style={styles.primaryText}>{busy ? 'Connecting…' : 'Connect'}</Text>
          </Pressable>
        </>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  h: { color: brand.text, fontSize: 18, fontWeight: '700' },
  body: { color: brand.textMuted, fontSize: 13.5, lineHeight: 19 },
  error: { color: brand.danger, fontSize: 13, lineHeight: 18 },
  input: { backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2, color: brand.text, fontSize: 14 },
  primary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: space.md },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  ghost: { alignItems: 'center', borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, paddingVertical: space.md },
  ghostText: { color: brand.danger, fontSize: 14, fontWeight: '700' },
  dim: { opacity: 0.6 },
  card: { backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  row: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  ok: { color: brand.success, fontSize: 14, fontWeight: '700' },
  mono: { color: brand.textFaint, fontSize: 12, fontFamily: 'monospace' },
});
