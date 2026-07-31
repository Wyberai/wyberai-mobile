import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView } from 'expo-blur';
import type { ReactNode } from 'react';
import { brand } from '@/lib/theme';

// Glassmorphic surface — real blur on iOS (BlurView), a flat translucent panel
// on Android (BlurView's Android backend is much lower fidelity and expensive
// per-instance; a solid semi-transparent surface reads as "glass enough" there
// and costs nothing). Use for tab bars, sheet headers, chat input bars — any
// surface that should feel like it's floating over content, not just another
// flat card.
export function GlassCard({
  children,
  style,
  intensity = 18,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  intensity?: number;
}) {
  if (Platform.OS === 'ios') {
    return (
      <BlurView intensity={intensity} tint="dark" style={[styles.base, style]}>
        {children}
      </BlurView>
    );
  }
  return <View style={[styles.base, styles.androidFallback, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  base: { overflow: 'hidden' },
  androidFallback: {
    backgroundColor: brand.glassSurface,
    borderWidth: 1,
    borderColor: brand.glassBorder,
  },
});
