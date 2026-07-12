import { useRef, useState } from 'react';
import {
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tap } from '@/lib/haptics';
import { brand, font, radius, space } from '@/lib/theme';

export const ONBOARDED_KEY = 'wyber:onboarded';

// First-launch sell — three swipes from install to "I get it". The guard in
// the root layout only shows this once (AsyncStorage flag), and Skip is always
// one tap away: nobody gets trapped in a tour.

const SLIDES = [
  {
    icon: 'sparkles' as const,
    title: 'Describe it.\nWatch it get built.',
    body: 'Type your idea in plain words — "a booking site for my salon" — and AI writes the real app, live in front of you.',
    accent: '#0EA5E9',
  },
  {
    icon: 'rocket' as const,
    title: 'Publish to a real URL\nin one tap',
    body: 'Every app ships to yourname.wyberai.com with a security scan before it goes live. Share it, sell with it, grow on it.',
    accent: '#22C55E',
  },
  {
    icon: 'phone-portrait' as const,
    title: 'Web and mobile.\nSame prompt.',
    body: 'Build web apps and native-style mobile apps from one idea — from your phone, on the bus, whenever it strikes.',
    accent: '#A855F7',
  },
];

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = Dimensions.get('window');
  const [page, setPage] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const last = page === SLIDES.length - 1;

  async function finish() {
    tap();
    try {
      await AsyncStorage.setItem(ONBOARDED_KEY, '1');
    } catch {
      /* worst case: they see the tour again */
    }
    onDone();
  }

  function next() {
    if (last) return finish();
    tap();
    scrollRef.current?.scrollTo({ x: (page + 1) * width, animated: true });
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['rgba(14,165,233,0.14)', 'transparent']}
        style={StyleSheet.absoluteFill}
      />
      <SafeAreaView style={styles.safe}>
        <View style={styles.topBar}>
          <Text style={styles.wordmark}>
            Wyber<Text style={styles.wordmarkAccent}>Ai</Text>
          </Text>
          <Pressable onPress={finish} hitSlop={10}>
            <Text style={styles.skip}>Skip</Text>
          </Pressable>
        </View>

        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(e) =>
            setPage(Math.round(e.nativeEvent.contentOffset.x / width))
          }
          style={styles.pager}
        >
          {SLIDES.map((s, i) => (
            <View key={i} style={[styles.slide, { width }]}>
              <View
                style={[
                  styles.slideIcon,
                  { backgroundColor: `${s.accent}22`, borderColor: `${s.accent}55` },
                ]}
              >
                <Ionicons name={s.icon} size={40} color={s.accent} />
              </View>
              <Text style={styles.slideTitle}>{s.title}</Text>
              <Text style={styles.slideBody}>{s.body}</Text>
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        <Pressable onPress={next} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text style={styles.ctaText}>{last ? 'Start building free' : 'Next'}</Text>
          <Ionicons name={last ? 'sparkles' : 'arrow-forward'} size={18} color={brand.onAccent} />
        </Pressable>
        <Text style={styles.fine}>Free credits included — no card needed to start.</Text>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: brand.bg },
  safe: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: space.lg,
    paddingTop: space.md,
  },
  wordmark: { color: brand.text, fontSize: 22, fontFamily: font.display, letterSpacing: -0.5 },
  wordmarkAccent: { color: brand.accent },
  skip: { color: brand.textMuted, fontSize: 14, fontWeight: '600' },
  pager: { flex: 1 },
  slide: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: space.xl,
    gap: space.lg,
  },
  slideIcon: {
    width: 96,
    height: 96,
    borderRadius: 28,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: space.sm,
  },
  slideTitle: {
    color: brand.text,
    fontSize: 30,
    fontFamily: font.display,
    letterSpacing: -0.8,
    textAlign: 'center',
    lineHeight: 36,
  },
  slideBody: {
    color: brand.textMuted,
    fontSize: 15.5,
    lineHeight: 23,
    textAlign: 'center',
    maxWidth: 320,
  },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 7, marginBottom: space.lg },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: brand.border },
  dotActive: { backgroundColor: brand.accent, width: 20 },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md + 3,
    marginHorizontal: space.lg,
  },
  ctaPressed: { backgroundColor: brand.accentDim },
  ctaText: { color: brand.onAccent, fontSize: 16.5, fontWeight: '800' },
  fine: {
    color: brand.textFaint,
    fontSize: 12,
    textAlign: 'center',
    marginTop: space.md,
    marginBottom: space.lg,
  },
});
