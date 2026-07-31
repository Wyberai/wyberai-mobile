import { memo, useEffect, useState } from 'react';
import { Text, type StyleProp, type TextStyle } from 'react-native';
import Animated, { useSharedValue, useAnimatedStyle, withTiming, withDelay } from 'react-native-reanimated';
import { useReducedMotion } from '@/lib/useReducedMotion';

const CHAR_DELAY_MS = 10;
const CHAR_FADE_MS = 120;

/**
 * Animates newly-appended characters in from opacity 0 — already-visible
 * characters never re-animate, only the delta since the last render does.
 * `text` should be the full accumulated string so far (as streamGenerate's
 * onText already provides), not a diff. Uses React's sanctioned
 * "adjust state during render" pattern (react.dev: storing info from
 * previous renders) to compute the seen/incoming split — not an effect,
 * since setState-in-effect is a lint error here, and not a ref, since
 * reading a ref during render is too.
 */
export const StreamingText = memo(function StreamingText({
  text,
  style,
}: {
  text: string;
  style?: StyleProp<TextStyle>;
}) {
  const [prevText, setPrevText] = useState(text);
  const [seenLength, setSeenLength] = useState(0);
  const reducedMotion = useReducedMotion();

  if (text !== prevText) {
    setSeenLength(prevText.length);
    setPrevText(text);
  }

  if (reducedMotion || text.length === 0) {
    return <Text style={style}>{text}</Text>;
  }

  const alreadyShown = text.slice(0, seenLength);
  const incoming = text.slice(seenLength);

  return (
    <Text style={style}>
      {alreadyShown}
      {incoming.split('').map((ch, i) => (
        <StreamingChar key={seenLength + i} delay={i * CHAR_DELAY_MS}>
          {ch}
        </StreamingChar>
      ))}
    </Text>
  );
});

function StreamingChar({ children, delay }: { children: string; delay: number }) {
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: CHAR_FADE_MS }));
    // Intentionally runs once per mount (a new character never remounts once seen).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return <Animated.Text style={animatedStyle}>{children}</Animated.Text>;
}
