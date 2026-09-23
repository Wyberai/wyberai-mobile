import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import * as DocumentPicker from 'expo-document-picker';
import { Ionicons } from '@expo/vector-icons';
import { importFromGithub, importFromZip } from '@/lib/api';
import { brand, radius, space } from '@/lib/theme';

export default function ImportScreen() {
  const router = useRouter();
  const [githubUrl, setGithubUrl] = useState('');
  const [busy, setBusy] = useState<'github' | 'zip' | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onImportGithub() {
    if (!githubUrl.trim() || busy) return;
    setBusy('github');
    setError(null);
    try {
      const { project } = await importFromGithub(githubUrl.trim());
      router.replace(`/build/${project.id}`);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function onPickZip() {
    if (busy) return;
    let result;
    try {
      // getDocumentAsync is a native call and can throw on a storage-
      // permission denial or provider crash on some Android versions — it
      // used to sit outside any try/catch, failing as a silent unhandled
      // rejection with no user-facing message.
      result = await DocumentPicker.getDocumentAsync({
        type: ['application/zip', 'application/x-zip-compressed'],
        copyToCacheDirectory: true,
      });
    } catch (e) {
      Alert.alert('Could not open file picker', (e as Error).message || 'Try again in a moment.');
      return;
    }
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setBusy('zip');
    setError(null);
    try {
      const { project } = await importFromZip(asset.uri, asset.name || 'import.zip');
      router.replace(`/build/${project.id}`);
    } catch (e) {
      Alert.alert('Import failed', (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: 'Import project' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="logo-github" size={20} color={brand.text} />
            <Text style={styles.cardTitle}>From GitHub</Text>
          </View>
          <Text style={styles.cardHint}>Paste a public repo URL (or a private one, if this account has GitHub connected).</Text>
          <TextInput
            style={styles.input}
            placeholder="https://github.com/owner/repo"
            placeholderTextColor={brand.textFaint}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="url"
            value={githubUrl}
            onChangeText={setGithubUrl}
            editable={busy === null}
          />
          <Pressable
            style={[styles.button, (!githubUrl.trim() || busy !== null) && styles.buttonDisabled]}
            onPress={onImportGithub}
            disabled={!githubUrl.trim() || busy !== null}
          >
            {busy === 'github' ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.buttonText}>Import repo</Text>}
          </Pressable>
        </View>

        <View style={styles.card}>
          <View style={styles.cardHeader}>
            <Ionicons name="archive-outline" size={20} color={brand.text} />
            <Text style={styles.cardTitle}>From a ZIP file</Text>
          </View>
          <Text style={styles.cardHint}>Source files up to 20 MB — node_modules and build output are skipped automatically.</Text>
          <Pressable style={[styles.button, styles.secondaryButton]} onPress={onPickZip} disabled={busy !== null}>
            {busy === 'zip' ? (
              <ActivityIndicator color={brand.accent} />
            ) : (
              <>
                <Ionicons name="folder-open-outline" size={16} color={brand.accent} />
                <Text style={styles.secondaryButtonText}>Choose ZIP file</Text>
              </>
            )}
          </Pressable>
        </View>

        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md },
  card: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  cardTitle: { color: brand.text, fontSize: 16, fontWeight: '700' },
  cardHint: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18 },
  input: {
    backgroundColor: brand.surfaceAlt,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.sm + 2,
    color: brand.text,
    fontSize: 14,
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.sm + 4,
    minHeight: 44,
  },
  buttonDisabled: { opacity: 0.4 },
  buttonText: { color: brand.onAccent, fontSize: 14, fontWeight: '700' },
  secondaryButton: { backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border },
  secondaryButtonText: { color: brand.accent, fontSize: 14, fontWeight: '700' },
  error: { color: brand.danger, fontSize: 13, textAlign: 'center' },
});
