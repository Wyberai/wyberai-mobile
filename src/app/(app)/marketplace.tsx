import { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, Pressable, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Stack, useFocusEffect, useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import {
  fetchMarketplaceListings,
  fetchMarketplacePurchaseStatus,
  purchaseMarketplaceListing,
  type MarketplaceListing,
} from '@/lib/api';
import { tap } from '@/lib/haptics';
import { Spinner } from '@/components/Spinner';
import { BottomSheet } from '@/components/BottomSheet';
import { useToast } from '@/components/Toast';
import { brand, font, radius, space } from '@/lib/theme';

export default function MarketplaceScreen() {
  const router = useRouter();
  const showToast = useToast();
  const [listings, setListings] = useState<MarketplaceListing[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [category, setCategory] = useState('All');
  const [selected, setSelected] = useState<MarketplaceListing | null>(null);
  const [buying, setBuying] = useState(false);

  const load = useCallback(() => {
    fetchMarketplaceListings().then((data) => {
      setListings(data);
      setLoading(false);
    });
  }, []);

  useFocusEffect(load);

  async function onRefresh() {
    setRefreshing(true);
    await fetchMarketplaceListings().then(setListings);
    setRefreshing(false);
  }

  const categories = useMemo(
    () => ['All', ...Array.from(new Set(listings.map((l) => l.category).filter(Boolean))).sort()],
    [listings],
  );
  const filtered = category === 'All' ? listings : listings.filter((l) => l.category === category);

  async function onBuy(listing: MarketplaceListing) {
    if (buying) return;
    tap();
    setBuying(true);
    // BottomSheet.choose() closes the sheet (and clears `selected`, which the
    // `actions` array is derived from) synchronously, ~10ms before this
    // function's caller even runs — the sheet is already gone by the time
    // any loading state here could render inside it. A toast is the only
    // feedback the user can actually see between tapping and the browser
    // opening.
    showToast('Opening checkout…');
    try {
      const { url, purchaseId } = await purchaseMarketplaceListing(listing.id);
      await WebBrowser.openBrowserAsync(url);
      // The Dodo webhook fulfills asynchronously — poll a few times right
      // after the checkout browser closes since it's usually near-instant,
      // but don't block forever on it: if it's still pending, the purchase
      // will simply show up in Projects once the webhook lands (this screen
      // and the project list both refetch on focus).
      let delivered: string | null = null;
      for (let i = 0; i < 4 && !delivered; i++) {
        await new Promise((r) => setTimeout(r, 2000));
        try {
          const status = await fetchMarketplacePurchaseStatus(purchaseId);
          if (status.deliveredProjectId) delivered = status.deliveredProjectId;
        } catch {
          break;
        }
      }
      if (delivered) {
        router.push(`/project/${delivered}`);
      } else {
        Alert.alert(
          'Purchase received',
          `"${listing.title}" is being added to your account — it'll appear in Projects shortly.`,
        );
      }
    } catch (e) {
      Alert.alert('Could not complete purchase', (e as Error).message);
    } finally {
      setBuying(false);
    }
  }

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ title: 'Marketplace', headerBackTitle: 'Back' }} />

      <FlatList
        horizontal
        showsHorizontalScrollIndicator={false}
        data={categories}
        keyExtractor={(c) => c}
        contentContainerStyle={styles.chipRow}
        style={styles.chipList}
        renderItem={({ item }) => (
          <Pressable onPress={() => setCategory(item)} style={[styles.chip, category === item && styles.chipActive]}>
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
          keyExtractor={(l) => l.id}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={brand.accent} />}
          ListEmptyComponent={
            <View style={styles.center}>
              <Ionicons name="storefront-outline" size={36} color={brand.textFaint} />
              <Text style={styles.emptyText}>No listings in this category yet.</Text>
            </View>
          }
          renderItem={({ item }) => (
            <Pressable
              onPress={() => { tap(); setSelected(item); }}
              style={({ pressed }) => [styles.card, pressed && styles.cardPressed]}
            >
              <View style={[styles.swatch, { backgroundColor: item.preview_color || brand.surfaceAlt }]}>
                <Ionicons name="cube-outline" size={22} color="rgba(255,255,255,0.85)" />
              </View>
              <Text style={styles.title} numberOfLines={1}>{item.title}</Text>
              <Text style={styles.price}>${item.price_usd}</Text>
              <Text style={styles.description} numberOfLines={2}>{item.description}</Text>
            </Pressable>
          )}
        />
      )}

      <BottomSheet
        visible={!!selected}
        title={selected?.title}
        subtitle={selected?.description}
        onClose={() => setSelected(null)}
        actions={
          selected
            ? [
                {
                  icon: 'card-outline',
                  // BottomSheet closes (and this whole actions array clears)
                  // before onPress runs, so a `buying`-driven label here would
                  // never actually render — see the comment in onBuy above.
                  label: `Buy for $${selected.price_usd}`,
                  description: 'Opens a secure checkout — a full editable copy lands in your Projects once payment completes.',
                  onPress: () => onBuy(selected),
                },
              ]
            : []
        }
      />
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
  swatch: { height: 72, borderRadius: radius.md, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { color: brand.text, fontSize: 14, fontFamily: font.display },
  price: { color: brand.accent, fontSize: 12.5, fontWeight: '700' },
  description: { color: brand.textMuted, fontSize: 12, lineHeight: 16 },
});
