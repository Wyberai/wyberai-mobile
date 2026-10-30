import { useEffect, useState } from 'react';
import { Linking, Pressable, ScrollView, Share, StyleSheet, Text, TextInput, View } from 'react-native';
import { Stack, useLocalSearchParams } from 'expo-router';
import { Image } from 'expo-image';
import * as Clipboard from 'expo-clipboard';
import QRCode from 'react-native-qrcode-svg';
import { supabase } from '@/lib/supabase';
import { API_BASE, fetchLaunchKit, type LaunchKitPosts } from '@/lib/api';
import { tap } from '@/lib/haptics';
import { useToast } from '@/components/Toast';
import { Spinner } from '@/components/Spinner';
import { brand, radius, space } from '@/lib/theme';

// Launch Kit — the same three things web's Publish → Launch Kit gives a maker:
// the share card, a counter QR, and posts written about THEIR app
// (POST /api/launch-kit). Posts are written by the server; nothing is
// generated on the phone.

type Channel = 'whatsapp' | 'linkedin' | 'x' | 'instagram' | 'producthunt';
const CHANNELS: { id: Channel; label: string }[] = [
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'x', label: 'X' },
  { id: 'instagram', label: 'Instagram' },
  { id: 'producthunt', label: 'Product Hunt' },
];
const EMPTY: Record<Channel, string> = { whatsapp: '', linkedin: '', x: '', instagram: '', producthunt: '' };

export default function LaunchKitScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const showToast = useToast();
  const [loading, setLoading] = useState(true);
  const [liveUrl, setLiveUrl] = useState<string | null>(null);
  const [kit, setKit] = useState<LaunchKitPosts | null>(null);
  const [drafts, setDrafts] = useState<Record<Channel, string>>(EMPTY);
  const [channel, setChannel] = useState<Channel>('whatsapp');
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!id) return;
    Promise.resolve(supabase.from('projects').select('published_url,deployed_url,custom_domain,subdomain').eq('id', id).maybeSingle())
      .then(({ data }) => {
        const p = data as { published_url?: string; deployed_url?: string; custom_domain?: string; subdomain?: string } | null;
        setLiveUrl(p?.deployed_url || p?.published_url || (p?.custom_domain ? `https://${p.custom_domain}` : null));
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [id]);

  async function writePosts() {
    if (!id) return;
    tap();
    setWriting(true);
    setError('');
    try {
      const data = await fetchLaunchKit(id);
      setKit(data);
      setDrafts({ ...data.posts, producthunt: `${data.productHunt.tagline}\n\n${data.productHunt.description}` });
    } catch (e) {
      setError((e as Error).message || 'Something went wrong — try again.');
    } finally {
      setWriting(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Launch kit' }} />
        <Spinner />
      </View>
    );
  }

  if (!liveUrl) {
    return (
      <View style={styles.center}>
        <Stack.Screen options={{ title: 'Launch kit' }} />
        <Text style={styles.emptyTitle}>Publish first</Text>
        <Text style={styles.emptyBody}>The launch kit is made from your live link. Publish your app, then come back.</Text>
      </View>
    );
  }

  const slug = liveUrl.split('/app/')[1]?.split(/[/?#]/)[0] ?? '';
  const text = drafts[channel];
  // WhatsApp and X take pre-filled text; the others don't, so copy first.
  const target: Record<Channel, { href: string; copyFirst: boolean; cta: string }> = {
    whatsapp: { href: `https://wa.me/?text=${encodeURIComponent(text)}`, copyFirst: false, cta: 'Send on WhatsApp' },
    x: { href: `https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}`, copyFirst: false, cta: 'Post on X' },
    linkedin: { href: `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(kit?.url || liveUrl)}`, copyFirst: true, cta: 'Copy & open LinkedIn' },
    instagram: { href: 'https://www.instagram.com/', copyFirst: true, cta: 'Copy & open Instagram' },
    producthunt: { href: 'https://www.producthunt.com/posts/new', copyFirst: true, cta: 'Copy & open Product Hunt' },
  };

  async function copy() {
    await Clipboard.setStringAsync(text);
    showToast('Copied');
  }

  async function post() {
    const t = target[channel];
    if (t.copyFirst) await Clipboard.setStringAsync(text);
    Linking.openURL(t.href).catch(() => showToast('Could not open that app'));
  }

  return (
    <>
      <Stack.Screen options={{ title: 'Launch kit' }} />
      <ScrollView style={styles.scroll} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {slug ? (
          <View style={{ gap: space.sm }}>
            <Image source={{ uri: `${API_BASE}/api/og/app/${slug}` }} style={styles.card} contentFit="cover" />
            <Text style={styles.hint}>The share card is what people see when your link is shared.</Text>
          </View>
        ) : null}

        <View style={styles.qrRow}>
          <View style={styles.qrBox}>
            <QRCode value={liveUrl} size={120} backgroundColor="#ffffff" color="#0b0b0e" />
          </View>
          <View style={{ flex: 1, gap: space.sm }}>
            <Text style={styles.sectionTitle}>Counter QR</Text>
            <Text style={styles.hint}>Show this on a counter, poster or at an event. It opens your app.</Text>
            <Pressable onPress={() => Share.share({ message: liveUrl, url: liveUrl }).catch(() => {})} style={styles.ghost}>
              <Text style={styles.ghostText}>Share link</Text>
            </Pressable>
          </View>
        </View>

        {!kit ? (
          <Pressable onPress={writePosts} disabled={writing} style={({ pressed }) => [styles.primary, (writing || pressed) && { opacity: 0.6 }]}>
            <Text style={styles.primaryText}>{writing ? 'Writing your launch posts…' : 'Write my launch posts'}</Text>
          </Pressable>
        ) : (
          <View style={{ gap: space.sm }}>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 6 }}>
              {CHANNELS.map((c) => (
                <Pressable key={c.id} onPress={() => setChannel(c.id)} style={[styles.pill, channel === c.id && styles.pillOn]}>
                  <Text style={[styles.pillText, channel === c.id && { color: brand.accent }]}>{c.label}</Text>
                </Pressable>
              ))}
            </ScrollView>
            <TextInput
              style={styles.draft}
              multiline
              value={text}
              onChangeText={(v) => setDrafts((d) => ({ ...d, [channel]: v }))}
              textAlignVertical="top"
            />
            <View style={{ flexDirection: 'row', gap: space.sm, alignItems: 'center' }}>
              <Pressable onPress={copy} style={styles.ghost}><Text style={styles.ghostText}>Copy</Text></Pressable>
              <Pressable onPress={post} style={[styles.ghost, styles.ghostOn]}><Text style={[styles.ghostText, { color: brand.onAccent }]}>{target[channel].cta}</Text></Pressable>
              <Pressable onPress={writePosts} disabled={writing} hitSlop={8} style={{ marginLeft: 'auto' }}>
                <Text style={styles.hint}>{writing ? 'Rewriting…' : 'Rewrite'}</Text>
              </Pressable>
            </View>
          </View>
        )}
        {error ? <Text style={styles.error}>{error}</Text> : null}
      </ScrollView>
    </>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg, gap: space.lg, paddingBottom: space.xxl },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm, backgroundColor: brand.bg },
  emptyTitle: { color: brand.text, fontSize: 18, fontWeight: '700' },
  emptyBody: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  card: { width: '100%', aspectRatio: 1200 / 630, borderRadius: radius.md, borderWidth: 1, borderColor: brand.border, backgroundColor: brand.surface },
  hint: { color: brand.textFaint, fontSize: 12, lineHeight: 17 },
  qrRow: { flexDirection: 'row', gap: space.lg, alignItems: 'center' },
  qrBox: { padding: 10, backgroundColor: '#ffffff', borderRadius: radius.md },
  sectionTitle: { color: brand.text, fontSize: 14, fontWeight: '700' },
  primary: { backgroundColor: brand.accent, borderRadius: radius.md, paddingVertical: 14, alignItems: 'center' },
  primaryText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
  pill: { paddingHorizontal: space.md, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1, borderColor: brand.border },
  pillOn: { borderColor: brand.accent, backgroundColor: 'rgba(14,165,233,0.08)' },
  pillText: { color: brand.textMuted, fontSize: 12.5, fontWeight: '600' },
  draft: { minHeight: 140, backgroundColor: brand.surfaceAlt, borderWidth: 1, borderColor: brand.border, borderRadius: radius.md, padding: space.md, color: brand.text, fontSize: 14, lineHeight: 20 },
  ghost: { borderWidth: 1, borderColor: brand.border, borderRadius: radius.sm + 2, paddingHorizontal: space.md, paddingVertical: 8, alignSelf: 'flex-start' },
  ghostOn: { backgroundColor: brand.accent, borderColor: brand.accent },
  ghostText: { color: brand.text, fontSize: 12.5, fontWeight: '700' },
  error: { color: brand.danger, fontSize: 12.5 },
});
