import { useEffect, useRef, useState } from 'react';
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
import { FadeInUp, staggerDelay } from '@/components/FadeInUp';
import { useT } from '@/lib/i18n/useT';
import { ONBOARDING_STRINGS } from '@/lib/i18n/dict/onboarding';
import { brand, font, radius, space } from '@/lib/theme';

export const ONBOARDED_KEY = 'wyber:onboarded';

// First-launch sell — three swipes from install to "I get it". The guard in
// the root layout only shows this once (AsyncStorage flag), and Skip is always
// one tap away: nobody gets trapped in a tour.

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = Dimensions.get('window');
  const t = useT(ONBOARDING_STRINGS);
  const SLIDES = [
    { icon: 'sparkles' as const, title: t('slide1Title'), body: t('slide1Body'), accent: '#0EA5E9' },
    { icon: 'rocket' as const, title: t('slide2Title'), body: t('slide2Body'), accent: '#22C55E' },
    { icon: 'phone-portrait' as const, title: t('slide3Title'), body: t('slide3Body'), accent: '#A855F7' },
  ];
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
            <Text style={styles.skip}>{t('skip')}</Text>
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
              {/* key re-triggers the entrance stagger every time this slide
                  becomes the active page — the pager itself is untouched. */}
              <FadeInUp key={`icon-${i}-${page === i}`} delay={staggerDelay(0)}>
                <View
                  style={[
                    styles.slideIcon,
                    { backgroundColor: `${s.accent}22`, borderColor: `${s.accent}55` },
                  ]}
                >
                  <Ionicons name={s.icon} size={40} color={s.accent} />
                </View>
              </FadeInUp>
              <FadeInUp key={`title-${i}-${page === i}`} delay={staggerDelay(1)}>
                <Text style={styles.slideTitle}>{s.title}</Text>
              </FadeInUp>
              <FadeInUp key={`body-${i}-${page === i}`} delay={staggerDelay(2)}>
                <Text style={styles.slideBody}>{s.body}</Text>
              </FadeInUp>
              {i === 0 ? (
                <FadeInUp key={`demo-${page === 0}`} delay={staggerDelay(3)}>
                  <TypeOnDemo active={page === 0} t={t} />
                </FadeInUp>
              ) : null}
            </View>
          ))}
        </ScrollView>

        <View style={styles.dots}>
          {SLIDES.map((_, i) => (
            <View key={i} style={[styles.dot, i === page && styles.dotActive]} />
          ))}
        </View>

        <Pressable onPress={next} style={({ pressed }) => [styles.cta, pressed && styles.ctaPressed]}>
          <Text style={styles.ctaText}>{last ? t('startBuildingFree') : t('next')}</Text>
          <Ionicons name={last ? 'sparkles' : 'arrow-forward'} size={18} color={brand.onAccent} />
        </Pressable>
        <Text style={styles.fine}>{t('freeCreditsNote')}</Text>
      </SafeAreaView>
    </View>
  );
}

// The 10-second product demo, no video needed: a prompt types itself out,
// then build steps check off — the exact loop the user is about to live.
function TypeOnDemo({ active, t }: { active: boolean; t: ReturnType<typeof useT<typeof ONBOARDING_STRINGS.en>> }) {
  const demoPrompt = t('demoPrompt');
  const demoSteps = [t('demoStep1'), t('demoStep2'), t('demoStep3')];
  const [chars, setChars] = useState(0);
  const [steps, setSteps] = useState(0);

  useEffect(() => {
    if (!active) return;
    let c = 0;
    let s = 0;
    let timer: ReturnType<typeof setTimeout>;
    const tick = () => {
      if (c < demoPrompt.length) {
        c += 1;
        setChars(c);
        timer = setTimeout(tick, 45);
      } else if (s < demoSteps.length) {
        s += 1;
        setSteps(s);
        timer = setTimeout(tick, 700);
      } else {
        // Hold the finished state, then loop.
        timer = setTimeout(() => {
          c = 0;
          s = 0;
          setChars(0);
          setSteps(0);
          tick();
        }, 2600);
      }
    };
    timer = setTimeout(tick, 500);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [active]);

  return (
    <View style={demoStyles.card}>
      <View style={demoStyles.promptRow}>
        <Ionicons name="sparkles" size={13} color={brand.accent} />
        <Text style={demoStyles.promptText}>
          {demoPrompt.slice(0, chars)}
          {chars < demoPrompt.length ? <Text style={demoStyles.caret}>▍</Text> : null}
        </Text>
      </View>
      {demoSteps.slice(0, steps).map((s) => (
        <View key={s} style={demoStyles.stepRow}>
          <Ionicons name="checkmark-circle" size={13} color={brand.success} />
          <Text style={demoStyles.stepText}>{s}</Text>
        </View>
      ))}
    </View>
  );
}

const demoStyles = StyleSheet.create({
  card: {
    width: 280,
    minHeight: 118,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.md,
    padding: space.md,
    gap: 7,
    marginTop: space.xs,
  },
  promptRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6 },
  promptText: { color: brand.text, fontSize: 13.5, lineHeight: 19, flexShrink: 1 },
  caret: { color: brand.accent },
  stepRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  stepText: { color: brand.textMuted, fontSize: 12.5 },
});

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
