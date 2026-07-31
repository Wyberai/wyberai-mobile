import { View, Text, Pressable, StyleSheet, Linking } from 'react-native';
import { Stack } from 'expo-router';
import * as Clipboard from 'expo-clipboard';
import { Ionicons } from '@expo/vector-icons';
import { useToast } from '@/components/Toast';
import { brand, font, radius, space } from '@/lib/theme';

const MCP_URL = 'https://wyberai.com/api/mcp';

// The recommended integration path is the OAuth-based MCP connector (per-user
// consent, no key to manage) — see wyberai.com/mcp for setup in Claude Code /
// Claude Desktop / the Connectors Directory. There's no self-serve "generate a
// raw API key" flow anywhere in the product yet (web included), so this screen
// doesn't invent one — it surfaces the one thing that's actually real today.
export default function ApiKeysScreen() {
  const showToast = useToast();

  function copyUrl() {
    Clipboard.setStringAsync(MCP_URL);
    showToast('MCP URL copied', 'success');
  }

  return (
    <View style={styles.container}>
      <Stack.Screen options={{ title: 'API & MCP' }} />
      <View style={styles.card}>
        <Text style={styles.label}>MCP Server URL</Text>
        <Pressable style={styles.urlRow} onPress={copyUrl}>
          <Text style={styles.url} numberOfLines={1}>{MCP_URL}</Text>
          <Ionicons name="copy-outline" size={18} color={brand.accent} />
        </Pressable>
        <Text style={styles.hint}>
          Add WyberAi as an MCP connector in Claude Code, Claude Desktop, or claude.ai — you&apos;ll sign in and consent from there, no key required.
        </Text>
      </View>

      <Pressable style={styles.docsBtn} onPress={() => Linking.openURL('https://wyberai.com/mcp')}>
        <Ionicons name="book-outline" size={16} color={brand.accent} />
        <Text style={styles.docsText}>Full setup guide</Text>
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
    gap: space.sm,
  },
  label: { color: brand.textFaint, fontSize: 11, fontWeight: '700', letterSpacing: 1, textTransform: 'uppercase' },
  urlRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: space.sm,
    backgroundColor: brand.surfaceAlt,
    borderRadius: radius.md,
    paddingHorizontal: space.md,
    paddingVertical: space.md,
  },
  url: { flex: 1, color: brand.text, fontSize: 13, fontFamily: font.sans },
  hint: { color: brand.textMuted, fontSize: 12.5, lineHeight: 18 },
  docsBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.md,
  },
  docsText: { color: brand.accent, fontSize: 14, fontWeight: '700' },
});
