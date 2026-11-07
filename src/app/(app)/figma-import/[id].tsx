import { useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { importFromFigma, loadProjectFiles, saveFiles, saveVersion, type FileMap } from '@/lib/api';
import { tap, success } from '@/lib/haptics';
import { brand, radius, space } from '@/lib/theme';

// Mirrors the web editor's Figma tab: paste a Figma share link (and, if the
// server has no default, a personal access token), get the first page back as
// a React component, then add it to the project at components/<Name>Figma.tsx.

export default function FigmaImportScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const [url, setUrl] = useState('');
  const [token, setToken] = useState('');
  const [showToken, setShowToken] = useState(false);
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ fileName: string; code: string } | null>(null);

  async function convert() {
    if (!url.trim() || loading) return;
    tap();
    setLoading(true);
    setError('');
    setResult(null);
    try {
      setResult(await importFromFigma(url.trim(), token.trim() || undefined));
    } catch (e) {
      setError((e as Error).message);
    }
    setLoading(false);
  }

  async function addToProject() {
    if (!result || !id || adding) return;
    tap();
    setAdding(true);
    try {
      const current = await loadProjectFiles(id);
      await saveVersion(id, current, 'Before Figma import');
      const path = `components/${result.fileName.replace(/\s+/g, '')}Figma.tsx`;
      const next: FileMap = { ...current, [path]: { content: result.code, language: 'typescript' } };
      await saveFiles(id, next);
      success();
      router.replace(`/build/${id}`);
    } catch (e) {
      setError(`Couldn't add it to the project: ${(e as Error).message}`);
    }
    setAdding(false);
  }

  return (
    <ScrollView style={styles.flex} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Stack.Screen options={{ title: 'Import from Figma', headerBackTitle: 'Back' }} />
      <Text style={styles.h}>Import from Figma</Text>
      <Text style={styles.body}>
        Turn a Figma design into a React component. In Figma, open the file, tap Share, then Copy link, and paste it here.
      </Text>
      <TextInput
        style={styles.input}
        placeholder="https://www.figma.com/file/..."
        placeholderTextColor={brand.textFaint}
        value={url}
        onChangeText={setUrl}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
      />
      <Pressable onPress={() => setShowToken((v) => !v)} hitSlop={8}>
        <Text style={styles.link}>{showToken ? 'Hide Figma token' : 'Use my own Figma token'}</Text>
      </Pressable>
      {showToken ? (
        <TextInput
          style={styles.input}
          placeholder="figd_… from figma.com/settings"
          placeholderTextColor={brand.textFaint}
          value={token}
          onChangeText={setToken}
          autoCapitalize="none"
          autoCorrect={false}
          secureTextEntry
        />
      ) : null}
      <Pressable style={[styles.primary, (loading || !url.trim()) && styles.dim]} onPress={convert} disabled={loading || !url.trim()}>
        {loading ? <ActivityIndicator color={brand.onAccent} /> : <Ionicons name="color-palette-outline" size={16} color={brand.onAccent} />}
        <Text style={styles.primaryText}>{loading ? 'Converting your design…' : 'Import from Figma'}</Text>
      </Pressable>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {result ? (
        <View style={styles.card}>
          <Text style={styles.ok}>Converted: {result.fileName}</Text>
          <Text style={styles.body}>{result.code.split('\n').length} lines of code generated.</Text>
          <Pressable style={[styles.success, adding && styles.dim]} onPress={addToProject} disabled={adding}>
            {adding ? <ActivityIndicator color={brand.onAccent} /> : null}
            <Text style={styles.primaryText}>Add to project</Text>
          </Pressable>
          <Text style={styles.code} numberOfLines={14}>{result.code}</Text>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.md, paddingBottom: space.xl * 2 },
  h: { color: brand.text, fontSize: 18, fontWeight: '700' },
  body: { color: brand.textMuted, fontSize: 13.5, lineHeight: 19 },
  link: { color: brand.accent, fontSize: 12.5, fontWeight: '600' },
  input: { backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, paddingHorizontal: space.md, paddingVertical: space.sm + 2, color: brand.text, fontSize: 14 },
  primary: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: space.md },
  success: { flexDirection: 'row', gap: 8, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.success, borderRadius: radius.md, paddingVertical: space.md },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  dim: { opacity: 0.6 },
  error: { color: brand.danger, fontSize: 13, lineHeight: 18 },
  card: { backgroundColor: brand.surface, borderColor: brand.border, borderWidth: 1, borderRadius: radius.lg, padding: space.md, gap: space.sm },
  ok: { color: brand.success, fontSize: 14, fontWeight: '700' },
  code: { color: brand.textFaint, fontSize: 10.5, fontFamily: 'monospace', backgroundColor: brand.surfaceAlt, borderRadius: radius.sm, padding: space.sm },
});
