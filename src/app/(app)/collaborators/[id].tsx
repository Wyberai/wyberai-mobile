import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { fetchCollaborators, inviteCollaborator, removeCollaborator, type Collaborator } from '@/lib/api';
import { Spinner } from '@/components/Spinner';
import { brand, font, radius, space } from '@/lib/theme';

export default function CollaboratorsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [collaborators, setCollaborators] = useState<Collaborator[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [email, setEmail] = useState('');
  const [inviting, setInviting] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    fetchCollaborators(id).then((c) => {
      setCollaborators(c);
      setLoading(false);
    });
  }, [id]);

  useFocusEffect(load);

  async function onInvite() {
    if (!id || !email.trim() || inviting) return;
    setInviting(true);
    try {
      await inviteCollaborator(id, email.trim());
      setEmail('');
      setAddOpen(false);
      load();
    } catch (e) {
      Alert.alert('Invite failed', (e as Error).message);
    } finally {
      setInviting(false);
    }
  }

  function onRemove(c: Collaborator) {
    if (!id) return;
    Alert.alert('Remove collaborator', `Remove ${c.collaborator_email}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Remove',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeCollaborator(id, c.id);
            load();
          } catch (e) {
            Alert.alert('Remove failed', (e as Error).message);
          }
        },
      },
    ]);
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen
        options={{
          title: 'Team',
          headerRight: () => (
            <Pressable onPress={() => setAddOpen(true)} hitSlop={8}>
              <Ionicons name="person-add-outline" size={22} color={brand.accent} />
            </Pressable>
          ),
        }}
      />
      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          contentContainerStyle={collaborators.length === 0 ? styles.emptyWrap : styles.list}
          data={collaborators}
          keyExtractor={(c) => c.id}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="people-outline" size={36} color={brand.textFaint} />
              <Text style={styles.emptyText}>No collaborators yet — invite someone to co-edit this project.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <View style={styles.row}>
              <View style={styles.avatar}>
                <Text style={styles.avatarText}>{item.collaborator_email.charAt(0).toUpperCase()}</Text>
              </View>
              <View style={styles.rowText}>
                <Text style={styles.email} numberOfLines={1}>{item.collaborator_email}</Text>
                <Text style={styles.meta}>
                  {item.role} · {item.status === 'accepted' ? 'active' : item.status}
                </Text>
              </View>
              <Pressable onPress={() => onRemove(item)} hitSlop={8}>
                <Ionicons name="close-circle-outline" size={20} color={brand.textMuted} />
              </Pressable>
            </View>
          )}
        />
      )}

      {addOpen ? (
        <View style={styles.addOverlay}>
          <View style={styles.addCard}>
            <Text style={styles.addTitle}>Invite collaborator</Text>
            <TextInput
              style={styles.input}
              placeholder="email@example.com"
              placeholderTextColor={brand.textFaint}
              autoCapitalize="none"
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <View style={styles.addActions}>
              <Pressable style={styles.cancelBtn} onPress={() => setAddOpen(false)}>
                <Text style={styles.cancelText}>Cancel</Text>
              </Pressable>
              <Pressable style={styles.saveBtn} onPress={onInvite} disabled={inviting}>
                {inviting ? <ActivityIndicator color={brand.onAccent} /> : <Text style={styles.saveText}>Invite</Text>}
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
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: brand.textMuted, fontSize: 13.5, textAlign: 'center', lineHeight: 19, maxWidth: 260 },
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
  avatar: {
    width: 34, height: 34, borderRadius: radius.pill,
    backgroundColor: brand.accent, alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { color: brand.onAccent, fontSize: 14, fontWeight: '700' },
  rowText: { flex: 1, gap: 2 },
  email: { color: brand.text, fontSize: 14, fontWeight: '600' },
  meta: { color: brand.textFaint, fontSize: 12, textTransform: 'capitalize' },
  addOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(6,6,10,0.7)', alignItems: 'center', justifyContent: 'center', padding: space.xl,
  },
  addCard: {
    width: '100%', backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border,
    borderRadius: radius.lg, padding: space.lg, gap: space.sm,
  },
  addTitle: { color: brand.text, fontSize: 16, fontFamily: font.display, marginBottom: space.xs },
  input: {
    backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, borderRadius: radius.md,
    paddingHorizontal: space.md, paddingVertical: space.sm + 2, color: brand.text, fontSize: 14,
  },
  addActions: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  cancelBtn: { flex: 1, alignItems: 'center', paddingVertical: space.sm + 2 },
  cancelText: { color: brand.textMuted, fontSize: 14, fontWeight: '600' },
  saveBtn: {
    flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.accent,
    borderRadius: radius.md, paddingVertical: space.sm + 2, minHeight: 42,
  },
  saveText: { color: brand.onAccent, fontSize: 14, fontWeight: '700' },
});
