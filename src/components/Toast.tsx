import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { brand, font, motion, radius, space } from '@/lib/theme';
import { success as hapticSuccess, warn as hapticWarn } from '@/lib/haptics';

type ToastKind = 'success' | 'error';
type ToastState = { message: string; kind: ToastKind; key: number } | null;

const ToastContext = createContext<(message: string, kind?: ToastKind) => void>(() => {});

// Global brief confirmation banner ("Saved!", "Theme applied") — slides down
// from the top, sits briefly, fades out. Fires the matching haptic so touch
// and visual feedback land together. Call `useToast()` from any screen; the
// provider lives once at the app root so only one can be visible at a time.
export function useToast() {
  return useContext(ToastContext);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toast, setToast] = useState<ToastState>(null);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const counter = useRef(0);

  const show = useCallback((message: string, kind: ToastKind = 'success') => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    counter.current += 1;
    setToast({ message, kind, key: counter.current });
    if (kind === 'success') hapticSuccess();
    else hapticWarn();
    dismissTimer.current = setTimeout(() => setToast(null), 2200);
  }, []);

  return (
    <ToastContext.Provider value={show}>
      {children}
      {toast ? <ToastBanner key={toast.key} message={toast.message} kind={toast.kind} /> : null}
    </ToastContext.Provider>
  );
}

const WEB_EASE = Easing.bezier(...motion.ease);

function ToastBanner({ message, kind }: { message: string; kind: ToastKind }) {
  const insets = useSafeAreaInsets();
  const progress = useSharedValue(0);

  progress.value = withTiming(1, { duration: motion.duration.fast, easing: WEB_EASE });

  const style = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * -16 }],
  }));

  return (
    <Animated.View
      pointerEvents="none"
      style={[styles.wrap, style, { top: insets.top + space.sm }]}
    >
      <View style={[styles.pill, kind === 'error' && styles.pillError]}>
        <Ionicons
          name={kind === 'error' ? 'close-circle' : 'checkmark-circle'}
          size={18}
          color={kind === 'error' ? brand.danger : brand.success}
        />
        <Text style={styles.text}>{message}</Text>
      </View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    zIndex: 999,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.sm,
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.pill,
    paddingHorizontal: space.lg,
    paddingVertical: space.sm + 2,
    shadowColor: '#000',
    shadowOpacity: 0.3,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  pillError: { borderColor: 'rgba(239,68,68,0.4)' },
  text: { color: brand.text, fontSize: 13.5, fontWeight: '700', fontFamily: font.displayMedium },
});
