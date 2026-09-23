import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createProjectFromTemplate, fetchPrebuiltApps, type PrebuiltApp } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { brand, font, radius, space } from '@/lib/theme';

export default function TemplatesScreen() {
  const router = useRouter();
  const [apps, setApps] = useState<PrebuiltApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('All');
  const [openingId, setOpeningId] = useState<string | null>(null);

  const load = useCallback(() => {
    fetchPrebuiltApps().then((data) => {
      setApps(data);
      setLoading(false);
    });
  }, []);

  useFocusEffect(load);

  async function onRefresh() {
    setRefreshing(true);
    await fetchPrebuiltApps().then(setApps);
    setRefreshing(false);
  }

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(apps.map((a) => a.category).filter(Boolean) as string[])).sort()],
    [apps],
  );
  const filtered = category === 'All' ? apps : apps.filter((a) => a.category === category);

  async function onUse(app: PrebuiltApp) {
    if (openingId) return;
    tap();
    setOpeningId(app.app_id);
    try {
      const projectId = await createProjectFromTemplate(app.app_id);
      router.push(`/project/${projectId}`);
    } catch (e) {
      Alert.alert('Could not start from this template', (e as Error).message);
    } finally {
      setOpeningId(null);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Templates', headerBackTitle: 'Back' }} />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={categories}
        keyExtractor={(c) => c}
        contentContainerStyle={styles.chipRow}
        style={styles.chipList}
        renderItem={({ item }) => (
          <Pressable
            onPress={() => setCategory(item)}
            style={[styles.chip, category === item && styles.chipActive]}
          >
            <Text style={[styles.chipText, category === item && styles.chipTextActive]}>{item}</Text>
          </Pressable>
        )}
      />

      {loading ? (
        <View style={styles.center}>
          <Spinner />
        </View>
      ) : (
        <FlatList
          key="grid-2"
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={filtered.length === 0 ? styles.emptyWrap : styles.grid}
          data={filtered}
          keyExtractor={(a) => a.app_id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="grid-outline" size={36} color={brand.textFaint} />
              <Text style={styles.emptyText}>No templates in this category yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => onUse(item)}
              disabled={!!openingId}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={[styles.swatch, { backgroundColor: item.preview_color || brand.surfaceAlt }]}>
                {openingId === item.app_id ? (
                  <Spinner />
                ) : (
                  <Ionicons name="apps-outline" size={22} color="rgba(255,255,255,0.85)" />
                )}
              </View>
              <Text style={styles.title} numberOfLines={1}>{item.name}</Text>
              {item.category ? (
                <Text style={styles.category} numberOfLines={1}>{item.category}</Text>
              ) : null}
              {item.description ? (
                <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
              ) : null}
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  emptyWrap: { flexGrow: 1, justifyContent: 'center' },
  emptyText: { color: brand.textMuted, fontSize: 14, textAlign: 'center' },
  chipList: { flexGrow: 0, borderBottomWidth: 1, borderBottomColor: brand.border },
  chipRow: { paddingHorizontal: space.lg, paddingVertical: space.sm, gap: space.sm },
  chip: {
    paddingHorizontal: space.md,
    paddingVertical: 6,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
  },
  chipActive: { borderColor: brand.accent, backgroundColor: 'rgba(14,165,233,0.1)' },
  chipText: { color: brand.textMuted, fontSize: 13, fontWeight: '600' },
  chipTextActive: { color: brand.text },
  grid: { padding: space.lg, gap: space.md },
  row: { gap: space.md },
  card: {
    flex: 1,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.lg,
    padding: space.sm,
    gap: 4,
  },
  cardPressed: { borderColor: brand.accent },
  swatch: {
    height: 72,
    borderRadius: radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 4,
  },
  title: { color: brand.text, fontSize: 14, fontFamily: font.display },
  category: { color: brand.accent, fontSize: 11, fontWeight: '600' },
  description: { color: brand.textMuted, fontSize: 12, lineHeight: 16 },
});
