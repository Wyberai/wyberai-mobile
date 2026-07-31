import { FlatList, Pressable, Text, View, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, space } from '@/lib/theme';

// Absolutely-positioned strip that floats just above the keyboard (caller
// wraps the input bar in KeyboardAvoidingView already) when the chat input
// ends in an in-progress "@partial" mention. Only triggers on a trailing
// mention (not mid-string edits) — the common, low-complexity case that
// covers the vast majority of real usage.
export function FileMentionPicker({
  query,
  files,
  onPick,
}: {
  query: string;
  files: string[];
  onPick: (path: string) => void;
}) {
  const matches = files
    .filter((f) => f.toLowerCase().includes(query.toLowerCase()))
    .slice(0, 8);

  if (matches.length === 0) return null;

  return (
    <View style={styles.container}>
      <FlatList
        data={matches}
        keyExtractor={(f) => f}
        keyboardShouldPersistTaps="always"
        renderItem={({ item }) => (
          <Pressable style={styles.row} onPress={() => onPick(item)}>
            <Ionicons name="document-text-outline" size={15} color={brand.textMuted} />
            <Text style={styles.path} numberOfLines={1}>{item}</Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    maxHeight: 180,
    backgroundColor: brand.surfaceAlt,
    borderTopWidth: 1,
    borderColor: brand.border,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  path: { flex: 1, color: brand.text, fontSize: 13 },
});
