import { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { Image } from 'expo-image';
import * as WebBrowser from 'expo-web-browser';
import { Ionicons } from '@expo/vector-icons';
import { useSession } from '@/ctx/session';
import { supabase } from '@/lib/supabase';
import {
  createProject,
  fetchGallery,
  type GalleryEntry,
  type ProjectType,
} from '@/lib/api';
import { thunk, tap } from '@/lib/haptics';
import { FadeInUp, staggerDelay } from '@/components/FadeInUp';
import { SkeletonGalleryCard } from '@/components/Skeleton';
import { projectUrl, type Project } from '@/lib/types';
import { brand, font, radius, space } from '@/lib/theme';

// Home — the conversion surface. The prompt box IS the product: type an idea,
// get a building app, no detours. Everything below it (starters, the live
// community gallery, the continue card) exists to get a first prompt typed.

const STARTERS: { label: string; prompt: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { label: 'Booking site', prompt: 'A booking website for my salon with services, prices, and an appointment form', icon: 'calendar-outline' },
  { label: 'Portfolio', prompt: 'A personal portfolio with my projects, an about section, and a contact form', icon: 'person-outline' },
  { label: 'Online store', prompt: 'An online store for handmade candles with a product grid, cart, and checkout form', icon: 'cart-outline' },
  { label: 'Habit tracker', prompt: 'A habit tracker with daily streaks, progress charts, and reminders', icon: 'checkmark-done-outline' },
  { label: 'Restaurant', prompt: 'A restaurant website with the menu, photos, opening hours, and a reservation form', icon: 'restaurant-outline' },
  { label: 'Event page', prompt: 'An event landing page with schedule, speakers, and an RSVP form', icon: 'ticket-outline' },
];

export default function HomeScreen() {
  const router = useRouter();
  const { user } = useSession();
  const [prompt, setPrompt] = useState('');
  const [type, setType] = useState<ProjectType>('web');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryEntry[]>([]);
  const [galleryLoading, setGalleryLoading] = useState(true);
  const [latest, setLatest] = useState<Project | null>(null);

  useEffect(() => {
    fetchGallery()
      .then(setGallery)
      .finally(() => setGalleryLoading(false));
  }, []);

  // "Continue building" — the most recently touched project, refreshed on focus.
  useFocusEffect(
    useCallback(() => {
      if (!user?.id) return;
      supabase
        .from('projects')
        .select('id,user_id,name,description,framework,subdomain,published_url,deployed_url,custom_domain,thumbnail_url,created_at,updated_at')
        .eq('user_id', user.id)
        .order('updated_at', { ascending: false })
        .limit(1)
        .then(({ data }) => setLatest(((data ?? [])[0] as Project) ?? null));
    }, [user?.id]),
  );

  async function onBuild() {
    if (!prompt.trim() || busy) return;
    thunk();
    setBusy(true);
    setError(null);
    try {
      const name = prompt.trim().split(/\s+/).slice(0, 4).join(' ').slice(0, 40) || 'New app';
      const id = await createProject({ name, prompt: prompt.trim(), type });
      setPrompt('');
      router.push({ pathname: '/build/[id]', params: { id, prompt: prompt.trim() } });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  const firstName = user?.email?.split('@')[0] ?? '';

  return (
    <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      {/* Hero */}
      <FadeInUp delay={staggerDelay(0)} style={styles.hero}>
        <LinearGradient
          colors={['rgba(14,165,233,0.20)', 'rgba(14,165,233,0.04)', 'transparent']}
          style={StyleSheet.absoluteFill}
        />
        <Text style={styles.heroKicker}>
          {firstName ? `Hey ${firstName} —` : 'Hey —'}
        </Text>
        <Text style={styles.heroTitle}>What will you{'\n'}build today?</Text>

        <View style={styles.promptCard}>
          <TextInput
            style={styles.promptInput}
            placeholder='Try "a booking site for my salon"…'
            placeholderTextColor={brand.textFaint}
            value={prompt}
            onChangeText={setPrompt}
            multiline
            editable={!busy}
          />
          <View style={styles.promptBar}>
            <View style={styles.typeToggle}>
              <TypePill
                active={type === 'web'}
                icon="globe-outline"
                label="Web"
                onPress={() => setType('web')}
              />
              <TypePill
                active={type === 'mobile'}
                icon="phone-portrait-outline"
                label="Mobile"
                onPress={() => setType('mobile')}
              />
            </View>
            <Pressable
              onPress={onBuild}
              disabled={busy || !prompt.trim()}
              style={({ pressed }) => [
                styles.buildBtn,
                (busy || !prompt.trim()) && styles.buildBtnDisabled,
                pressed && styles.buildBtnPressed,
              ]}
            >
              {busy ? (
                <ActivityIndicator color={brand.onAccent} size="small" />
              ) : (
                <>
                  <Ionicons name="sparkles" size={15} color={brand.onAccent} />
                  <Text style={styles.buildBtnText}>Build it</Text>
                </>
              )}
            </Pressable>
          </View>
        </View>
        {error ? <Text style={styles.error}>{error}</Text> : null}

        {/* Starter chips */}
        <View style={styles.chips}>
          {STARTERS.map((s) => (
            <Pressable
              key={s.label}
              onPress={() => {
                tap();
                setPrompt(s.prompt);
              }}
              style={({ pressed }) => [styles.chip, pressed && styles.chipPressed]}
            >
              <Ionicons name={s.icon} size={13} color={brand.accent} />
              <Text style={styles.chipText}>{s.label}</Text>
            </Pressable>
          ))}
        </View>
      </FadeInUp>

      {/* Continue building */}
      {latest ? (
        <FadeInUp delay={staggerDelay(1)}>
        <Pressable
          onPress={() => router.push(`/project/${latest.id}`)}
          style={({ pressed }) => [styles.continueCard, pressed && { backgroundColor: brand.surfaceAlt }]}
        >
          {latest.thumbnail_url ? (
            <Image source={{ uri: latest.thumbnail_url }} style={styles.continueThumb} contentFit="cover" />
          ) : (
            <View style={[styles.continueThumb, styles.continueThumbEmpty]}>
              <Ionicons name="cube-outline" size={20} color={brand.textFaint} />
            </View>
          )}
          <View style={styles.continueText}>
            <Text style={styles.continueKicker}>CONTINUE BUILDING</Text>
            <Text style={styles.continueName} numberOfLines={1}>
              {latest.name || 'Untitled'}
            </Text>
            <Text style={styles.continueMeta}>
              {projectUrl(latest) ? '● Live' : 'Draft'} · updated {timeAgo(latest.updated_at)}
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={brand.textFaint} />
        </Pressable>
        </FadeInUp>
      ) : null}

      {/* Value props */}
      <FadeInUp delay={staggerDelay(2)} style={styles.props}>
        <Prop icon="flash-outline" title="~60 seconds" body="to your first working version" />
        <Prop icon="link-outline" title="Real URL" body="publish live in one tap" />
        <Prop icon="shield-checkmark-outline" title="Security-scanned" body="before anything ships" />
      </FadeInUp>

      {/* Community showcase */}
      {galleryLoading ? (
        <View style={styles.gallerySection}>
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryTitle}>Built with WyberAi this week</Text>
            <Text style={styles.gallerySub}>Real apps by real users — yours could be here</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
            {[0, 1, 2].map((i) => (
              <SkeletonGalleryCard key={i} />
            ))}
          </ScrollView>
        </View>
      ) : gallery.length > 0 ? (
        <FadeInUp delay={staggerDelay(3)} style={styles.gallerySection}>
          <View style={styles.galleryHeader}>
            <Text style={styles.galleryTitle}>Built with WyberAi this week</Text>
            <Text style={styles.gallerySub}>Real apps by real users — yours could be here</Text>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.galleryRow}>
            {gallery.slice(0, 10).map((entry) => (
              <Pressable
                key={entry.id}
                onPress={() => {
                  tap();
                  WebBrowser.openBrowserAsync(entry.live_url).catch(() => {});
                }}
                style={({ pressed }) => [styles.galleryCard, pressed && styles.galleryCardPressed]}
              >
                {entry.thumbnail_url ? (
                  <Image source={{ uri: entry.thumbnail_url }} style={styles.galleryThumb} contentFit="cover" transition={150} />
                ) : (
                  <View style={[styles.galleryThumb, styles.galleryThumbEmpty]}>
                    <Ionicons name="globe-outline" size={22} color={brand.textFaint} />
                  </View>
                )}
                <View style={styles.galleryCardBody}>
                  <Text style={styles.galleryCardTitle} numberOfLines={1}>
                    {entry.title}
                  </Text>
                  <View style={styles.galleryCardMeta}>
                    {entry.handle ? (
                      <Text style={styles.galleryHandle} numberOfLines={1}>
                        @{entry.handle.replace(/^@/, '')}
                      </Text>
                    ) : (
                      <View />
                    )}
                    <View style={styles.votes}>
                      <Ionicons name="arrow-up" size={11} color={brand.accent} />
                      <Text style={styles.votesText}>{entry.vote_count}</Text>
                    </View>
                  </View>
                </View>
              </Pressable>
            ))}
          </ScrollView>
        </FadeInUp>
      ) : null}

      <View style={{ height: space.xl }} />
    </ScrollView>
  );
}

function TypePill({
  active,
  icon,
  label,
  onPress,
}: {
  active: boolean;
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
}) {
  return (
    <Pressable onPress={onPress} style={[styles.pill, active && styles.pillActive]}>
      <Ionicons name={icon} size={13} color={active ? brand.text : brand.textFaint} />
      <Text style={[styles.pillText, active && styles.pillTextActive]}>{label}</Text>
    </Pressable>
  );
}

function Prop({ icon, title, body }: { icon: keyof typeof Ionicons.glyphMap; title: string; body: string }) {
  return (
    <View style={styles.prop}>
      <Ionicons name={icon} size={18} color={brand.accent} />
      <Text style={styles.propTitle}>{title}</Text>
      <Text style={styles.propBody}>{body}</Text>
    </View>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  return `${Math.floor(h / 24)}d ago`;
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { paddingBottom: space.xl },
  hero: {
    paddingHorizontal: space.lg,
    paddingTop: space.lg,
    paddingBottom: space.md,
    overflow: 'hidden',
  },
  heroKicker: { color: brand.textMuted, fontSize: 14, fontWeight: '600' },
  heroTitle: {
    color: brand.text,
    fontSize: 34,
    fontFamily: font.display,
    letterSpacing: -1,
    lineHeight: 40,
    marginTop: 4,
    marginBottom: space.lg,
  },
  promptCard: {
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  promptInput: {
    minHeight: 76,
    maxHeight: 140,
    padding: space.md,
    color: brand.text,
    fontSize: 15.5,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  promptBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: space.sm,
    borderTopWidth: 1,
    borderTopColor: brand.border,
    backgroundColor: brand.surfaceAlt,
  },
  typeToggle: { flexDirection: 'row', gap: 4 },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  pillActive: { backgroundColor: brand.surface, borderWidth: 1, borderColor: brand.border },
  pillText: { color: brand.textFaint, fontSize: 12.5, fontWeight: '600' },
  pillTextActive: { color: brand.text },
  buildBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: brand.accent,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    borderRadius: radius.pill,
  },
  buildBtnPressed: { backgroundColor: brand.accentDim, transform: [{ scale: 0.95 }] },
  buildBtnDisabled: { opacity: 0.4 },
  buildBtnText: { color: brand.onAccent, fontSize: 14, fontWeight: '800' },
  error: { color: brand.danger, fontSize: 13, marginTop: space.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginTop: space.md },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    paddingHorizontal: space.md,
    paddingVertical: 7,
    borderRadius: radius.pill,
  },
  chipPressed: { borderColor: brand.accent, transform: [{ scale: 0.95 }] },
  chipText: { color: brand.textMuted, fontSize: 12.5, fontWeight: '600' },
  continueCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.md,
    marginHorizontal: space.lg,
    marginTop: space.sm,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: space.md,
  },
  continueThumb: { width: 52, height: 52, borderRadius: radius.md, backgroundColor: brand.surfaceAlt },
  continueThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  continueText: { flex: 1, gap: 2 },
  continueKicker: { color: brand.accent, fontSize: 9.5, fontWeight: '800', letterSpacing: 1 },
  continueName: { color: brand.text, fontSize: 15.5, fontWeight: '700' },
  continueMeta: { color: brand.textFaint, fontSize: 12 },
  props: {
    flexDirection: 'row',
    gap: space.sm,
    paddingHorizontal: space.lg,
    marginTop: space.lg,
  },
  prop: {
    flex: 1,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: 3,
  },
  propTitle: { color: brand.text, fontSize: 13, fontWeight: '800', marginTop: 3 },
  propBody: { color: brand.textFaint, fontSize: 11, lineHeight: 15 },
  gallerySection: { marginTop: space.xl },
  galleryHeader: { paddingHorizontal: space.lg, gap: 2, marginBottom: space.md },
  galleryTitle: { color: brand.text, fontSize: 19, fontFamily: font.display, letterSpacing: -0.4 },
  gallerySub: { color: brand.textMuted, fontSize: 13 },
  galleryRow: { paddingHorizontal: space.lg, gap: space.md },
  galleryCard: {
    width: 190,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    overflow: 'hidden',
  },
  galleryCardPressed: { borderColor: brand.accent, transform: [{ scale: 0.95 }] },
  galleryThumb: { width: '100%', height: 110, backgroundColor: brand.surfaceAlt },
  galleryThumbEmpty: { alignItems: 'center', justifyContent: 'center' },
  galleryCardBody: { padding: space.md, gap: 5 },
  galleryCardTitle: { color: brand.text, fontSize: 13.5, fontWeight: '700' },
  galleryCardMeta: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 6 },
  galleryHandle: { color: brand.textFaint, fontSize: 11.5, flexShrink: 1 },
  votes: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  votesText: { color: brand.accent, fontSize: 11.5, fontWeight: '700' },
});
