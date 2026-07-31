import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { WebView } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { tap } from '@/lib/haptics';
import { FadeInUp, staggerDelay } from '@/components/FadeInUp';
import { GlassCard } from '@/components/GlassCard';
import { AGENT_TEAM } from '@/lib/agents/roster';
import { useT } from '@/lib/i18n/useT';
import { ONBOARDING_STRINGS } from '@/lib/i18n/dict/onboarding';
import { brand, font, radius, space } from '@/lib/theme';

// The 5 builder personas (excludes 'orchestrator' — that's the lead role
// shown inline in the live feed, not a slide-2 card) — same roster the real
// AgentFeed uses, so onboarding shows the exact team the user will meet.
const AGENT_CARDS = (['planner', 'coder', 'design', 'security', 'qa'] as const).map((id) => AGENT_TEAM[id]);

export const ONBOARDED_KEY = 'wyber:onboarded';

// First-launch sell — three swipes from install to "I get it". The guard in
// the root layout only shows this once (AsyncStorage flag), and Skip is always
// one tap away: nobody gets trapped in a tour.

export function Onboarding({ onDone }: { onDone: () => void }) {
  const { width } = Dimensions.get('window');
  const t = useT(ONBOARDING_STRINGS);
  const SLIDES = [
    { icon: 'sparkles' as const, title: t('slide1Title'), body: t('slide1Body'), accent: brand.accent },
    { icon: 'rocket' as const, title: t('slide2Title'), body: t('slide2Body'), accent: brand.success },
    { icon: 'phone-portrait' as const, title: t('slide3Title'), body: t('slide3Body'), accent: brand.violet },
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
              ) : i === 1 ? (
                <AgentCardsDemo active={page === 1} />
              ) : (
                <FadeInUp key={`phone-${page === 2}`} delay={staggerDelay(3)}>
                  <PhoneMockup active={page === 2} />
                </FadeInUp>
              )}
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
    <GlassCard style={demoStyles.card}>
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
    </GlassCard>
  );
}

// Slide 2 — the agent team, flying in staggered (same roster + colors as the
// real AgentFeed during a build, so this is a preview of an actual feature,
// not a mockup of one).
function AgentCardsDemo({ active }: { active: boolean }) {
  return (
    <View style={demoStyles.agentGrid}>
      {AGENT_CARDS.map((agent, i) => (
        <FadeInUp key={`${agent.id}-${active}`} delay={staggerDelay(i, 100)} style={demoStyles.agentCardWrap}>
          <GlassCard style={[demoStyles.agentCard, { borderColor: `${agent.color}55` }]}>
            <View style={[demoStyles.agentDot, { backgroundColor: agent.color }]} />
            <Text style={demoStyles.agentName}>{agent.name}</Text>
            <Text style={demoStyles.agentRole}>{agent.role}</Text>
          </GlassCard>
        </FadeInUp>
      ))}
    </View>
  );
}

// Slide 3 — a phone-frame mockup with a live, miniaturized WebView of the
// marketing site. Non-interactive (pointerEvents="none") — it's a visual, not
// a real browser; tapping through it would just feel broken mid-onboarding.
function PhoneMockup({ active }: { active: boolean }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  if (!active) return <View style={demoStyles.phoneFrame} />;
  return (
    <View style={demoStyles.phoneFrame}>
      <View style={demoStyles.phoneNotch} />
      <View style={demoStyles.phoneScreen} pointerEvents="none">
        {failed ? (
          // onLoadEnd fires on BOTH success and failure — without a separate
          // error handler, a DNS hiccup or slow network here would just clear
          // the loading spinner and leave a blank/broken embedded page during
          // onboarding, with no indication anything went wrong.
          <View style={demoStyles.phoneFallback}>
            <Ionicons name="globe-outline" size={22} color={brand.textFaint} />
          </View>
        ) : (
          <WebView
            source={{ uri: 'https://wyberai.com' }}
            style={demoStyles.phoneWebview}
            onLoadEnd={() => setLoaded(true)}
            onError={() => setFailed(true)}
            onHttpError={() => setFailed(true)}
            scrollEnabled={false}
          />
        )}
        {!loaded && !failed ? (
          <View style={demoStyles.phoneLoading}>
            <ActivityIndicator color={brand.accent} />
          </View>
        ) : null}
      </View>
    </View>
  );
}

const demoStyles = StyleSheet.create({
  // No backgroundColor/border here — GlassCard supplies both (a solid color
  // on top of its BlurView would fully cancel the blur on iOS).
  card: {
    width: 280,
    minHeight: 118,
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
  agentGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: space.sm,
    marginTop: space.xs,
    width: 300,
  },
  agentCardWrap: { width: 88 },
  agentCard: {
    alignItems: 'center',
    borderRadius: radius.md,
    borderWidth: 1,
    paddingVertical: space.md,
    paddingHorizontal: space.xs,
    gap: 4,
  },
  agentDot: { width: 10, height: 10, borderRadius: 5, marginBottom: 2 },
  agentName: { color: brand.text, fontSize: 13, fontFamily: font.displayMedium },
  agentRole: { color: brand.textFaint, fontSize: 10.5 },
  phoneFrame: {
    width: 150,
    height: 300,
    borderRadius: 28,
    borderWidth: 6,
    borderColor: brand.border,
    backgroundColor: brand.bg,
    padding: 4,
    marginTop: space.xs,
    alignItems: 'center',
  },
  phoneNotch: {
    width: 50,
    height: 14,
    borderRadius: 8,
    backgroundColor: brand.border,
    marginBottom: 4,
  },
  phoneScreen: {
    flex: 1,
    width: '100%',
    borderRadius: 18,
    overflow: 'hidden',
    backgroundColor: brand.bg,
  },
  phoneWebview: { flex: 1 },
  phoneLoading: {
    ...StyleSheet.absoluteFill,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.bg,
  },
  phoneFallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: brand.bg,
  },
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
