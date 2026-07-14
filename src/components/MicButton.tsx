import { useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Animated, {
  Easing,
  cancelAnimation,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import {
  ExpoSpeechRecognitionModule,
  useSpeechRecognitionEvent,
} from 'expo-speech-recognition';
import { tap } from '@/lib/haptics';
import { brand } from '@/lib/theme';

// Push-to-talk prompt input: on-device speech recognition streams the live
// transcript into the field while the user is still speaking. Self-hides on
// devices without a speech service; every error path just stops the pulse —
// voice must never throw an alert or break the input it augments.

interface Props {
  /** Current text of the field the mic writes into (snapshot base on start). */
  value: string;
  /** Receives base + live transcript on every interim/final result. */
  onChangeText: (text: string) => void;
  disabled?: boolean;
  size?: number;
}

export function MicButton({ value, onChangeText, disabled, size = 34 }: Props) {
  const [available, setAvailable] = useState(false);
  const [listening, setListening] = useState(false);
  // Text that was in the field when recognition started; transcripts append to it.
  const baseRef = useRef('');
  // Finalized speech from earlier result events in this same session.
  const finalRef = useRef('');
  const pulse = useSharedValue(0);

  useEffect(() => {
    try {
      setAvailable(ExpoSpeechRecognitionModule.isRecognitionAvailable());
    } catch {
      setAvailable(false);
    }
  }, []);

  useEffect(() => {
    if (listening) {
      pulse.value = withRepeat(
        withTiming(1, { duration: 900, easing: Easing.inOut(Easing.ease) }),
        -1,
        true,
      );
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(0, { duration: 150 });
    }
  }, [listening, pulse]);

  useSpeechRecognitionEvent('result', (event) => {
    const transcript = event.results?.[0]?.transcript ?? '';
    if (!transcript) return;
    const spoken = (finalRef.current + ' ' + transcript).trim();
    onChangeText(baseRef.current ? `${baseRef.current} ${spoken}` : spoken);
    if (event.isFinal) finalRef.current = spoken;
  });
  useSpeechRecognitionEvent('end', () => setListening(false));
  useSpeechRecognitionEvent('error', () => setListening(false));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: 0.5 - pulse.value * 0.35,
    transform: [{ scale: 1 + pulse.value * 0.55 }],
  }));

  if (!available) return null;

  async function toggle() {
    tap();
    if (listening) {
      try { ExpoSpeechRecognitionModule.stop(); } catch { /* already stopped */ }
      setListening(false);
      return;
    }
    try {
      const perm = await ExpoSpeechRecognitionModule.requestPermissionsAsync();
      if (!perm.granted) return;
      baseRef.current = value.trim();
      finalRef.current = '';
      ExpoSpeechRecognitionModule.start({
        lang: 'en-US',
        interimResults: true,
        continuous: false,
      });
      setListening(true);
    } catch {
      setListening(false);
    }
  }

  return (
    <Pressable
      onPress={toggle}
      disabled={disabled}
      hitSlop={8}
      accessibilityLabel={listening ? 'Stop listening' : 'Speak your idea'}
      style={({ pressed }) => [
        styles.btn,
        { width: size, height: size, borderRadius: size / 2 },
        listening && styles.btnListening,
        pressed && { transform: [{ scale: 0.92 }] },
        disabled && { opacity: 0.4 },
      ]}
    >
      {listening ? (
        <Animated.View
          pointerEvents="none"
          style={[
            styles.ring,
            { width: size, height: size, borderRadius: size / 2 },
            ringStyle,
          ]}
        />
      ) : null}
      <Ionicons
        name={listening ? 'mic' : 'mic-outline'}
        size={Math.round(size * 0.5)}
        color={listening ? brand.danger : brand.textMuted}
      />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  btnListening: {
    backgroundColor: 'rgba(239,68,68,0.12)',
  },
  ring: {
    position: 'absolute',
    borderWidth: 1.5,
    borderColor: brand.danger,
  },
});
