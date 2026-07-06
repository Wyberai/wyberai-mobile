import { useEffect, useRef } from 'react';
import { Animated, Easing } from 'react-native';
import { brand } from '@/lib/theme';

// Matches the web app's loader exactly: a ring with a faint sky track and a
// bright sky top-arc, spinning at 0.8s linear (see globals.css / AgentCanvas).
export function Spinner({ size = 32, color = brand.accent }: { size?: number; color?: string }) {
  const spin = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(spin, {
        toValue: 1,
        duration: 800,
        easing: Easing.linear,
        useNativeDriver: true,
      }),
    );
    loop.start();
    return () => loop.stop();
  }, [spin]);

  const rotate = spin.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '360deg'] });
  const borderWidth = Math.max(2, Math.round(size / 11));

  return (
    <Animated.View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        borderWidth,
        borderColor: 'rgba(14,165,233,0.2)',
        borderTopColor: color,
        transform: [{ rotate }],
      }}
    />
  );
}
