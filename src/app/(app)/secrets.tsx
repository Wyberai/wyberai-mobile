import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { deleteSecret, fetchSecrets, saveSecret, type SecretEntry } from '@/lib/api';
import { brand, font, radius, space } from '@/lib/theme';

export default function SecretsScreen() {
  const [secrets, setSecrets] = useState<SecretEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [value, setValue] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    fetchSecrets().then((s) => {
      setSecrets(s);
      setLoading(false);
    });
  }, []);

  useFocusEffect(load);

  async function onSave() {
    if (!name.trim() || !value.trim() || saving) return;
    setSaving(true);
    try {
      await saveSecret(name, value);
      setName('');
      setValue('');
      setAddOpen(false);
      load();
    } catch (e) {
      Alert.alert('Save failed', (e as Error).message);
    } finally {
      setSaving(false);
    }
  }

  function onDelete(entry: SecretEntry) {
    Alert.alert('Delete secret', `Remove "${entry.name}"? Anything using it will stop working.`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteSecret(entry.name);
            load();
          } catch (e) {
            Alert.alert('Delete failed', (e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: 'Secrets',
          headerRight: () => (
            <Pressable onPress={() => setAddOpen(true)} hitSlop={8}>
              <Ionicons name="add" size={24} color={brand.accent} />
            </Pressable>
          ),
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <ActivityIndicator color={brand.accent} />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={styles.list}
          data={secrets}
          keyExtractor={(s) => s.id}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="key-outline" size={32} color={brand.textFaint} />
              <Text style={styles.emptyText}>No secrets yet — add an API key your builds can use.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.rowText}>
                <Text style={styles.name}>{item.name}</Text>
                <Text style={styles.preview}>{item.preview}</Text>
              </View>
              <Pressable onPress={() => onDelete(item)} hitSlop={8}>
                <Ionicons name="trash-outline" size={18} color={brand.textMuted} />
              </Pressable>
            </View>
          )}
        />
      )}

      {addOpen ? (
        <View style={styles.addOverlay}>
          <View style={styles.addCard}>
            <Text style={styles.addTitle}>Add secret</Text>
            <TextInput
              style={styles.input}
              placeholder="NAME (e.g. STRIPE_SECRET_KEY)"
              placeholderTextColor={brand.textFaint}
              autoCapitalize="characters"
              value={name}
              onChangeText={setName}
            />
            <TextInput
              style={styles.input}
              placeholder="Value"
              placeholderTextColor={brand.textFaint}
              secureTextEntry
              value={value}
              onChangeText={setValue}
            />
            <View style={styles.addActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setAddOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={onSave} disabled={saving}>
                {saving ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.saveText}>Save</Text>}
              </Pressable>
            </View>
          </View>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, minHeight: 300 },
  emptyText: { color: brand.textMuted, fontSize: 13.5, textAlign: 'center', lineHeight: 19 },
  list: { padding: space.lg, gap: space.sm },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    padding: space.md,
  },
  rowText: { flex: 1, gap: 2 },
  name: { color: brand.text, fontSize: 14, fontWeight: '700' },
  preview: { color: brand.textFaint, fontSize: 12.5 },
  addOverlay: {
    position: 'absolute',
    top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(6,6,10,0.7)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  addCard: {
    width: '100%',
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: space.lg,
    gap: space.sm,
  },
  addTitle: { color: brand.text, fontSize: 16, fontFamily: font.display, marginBottom: space.xs },
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
  addActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: space.sm + 2 },
  cancelText: { color: brand.textMuted, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.sm + 2,
    minHeight: 42,
  },
  saveText: { color: brand.onAccent, fontSize: 14, fontWeight: '700' },
});
