import { useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { createProject, type ProjectType } from '@/lib/api';
import { useT } from '@/lib/i18n/useT';
import { NEW_APP_STRINGS } from '@/lib/i18n/dict/new-app';
import { brand, radius, space } from '@/lib/theme';

export default function NewAppScreen() {
  const router = useRouter();
  const t = useT(NEW_APP_STRINGS);
  const [type, setType] = useState<ProjectType>('web');
  const [prompt, setPrompt] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [focused, setFocused] = useState(false);
  const [shake] = useState(() => new Animated.Value(0));

  function runShake() {
    shake.setValue(0);
    Animated.sequence([
      Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: -1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 1, duration: 45, useNativeDriver: true }),
      Animated.timing(shake, { toValue: 0, duration: 45, useNativeDriver: true }),
    ]).start();
  }

  async function onCreate() {
    if (!prompt.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const name = deriveName(prompt);
      const id = await createProject({ name, prompt: prompt.trim(), type });
      // Replace so Back returns to the projects list, not this form.
      router.replace({ pathname: '/build/[id]', params: { id, prompt: prompt.trim() } });
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
      runShake();
    }
  }

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <Stack.Screen options={{ title: t('screenTitle') }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Text style={styles.label}>{t('whatBuilding')}</Text>
        <View style={styles.segment}>
          <SegOption
            active={type === 'web'}
            icon="globe-outline"
            label={t('webApp')}
            onPress={() => setType('web')}
          />
          <SegOption
            active={type === 'mobile'}
            icon="phone-portrait-outline"
            label={t('mobileApp')}
            onPress={() => setType('mobile')}
          />
        </View>

        <Text style={[styles.label, { marginTop: space.lg }]}>{t('describeIt')}</Text>
        <Animated.View
          style={{
            transform: [{ translateX: shake.interpolate({ inputRange: [-1, 1], outputRange: [-6, 6] }) }],
          }}
        >
          <TextInput
            style={[styles.textarea, focused && styles.textareaFocused]}
            placeholder={type === 'mobile' ? t('placeholderMobile') : t('placeholderWeb')}
            placeholderTextColor={brand.textFaint}
            value={prompt}
            onChangeText={setPrompt}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            multiline
            editable={!busy}
            autoFocus
          />
        </Animated.View>

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Pressable
          onPress={onCreate}
          disabled={busy || !prompt.trim()}
          style={({ pressed }) => [
            styles.cta,
            (busy || !prompt.trim()) && styles.ctaDisabled,
            pressed && styles.ctaPressed,
          ]}
        >
          {busy ? (
            <ActivityIndicator color={brand.onAccent} />
          ) : (
            <>
              <Ionicons name="sparkles" size={18} color={brand.onAccent} />
              <Text style={styles.ctaText}>{t('startBuilding')}</Text>
            </>
          )}
        </Pressable>

        <Text style={styles.hint}>{t('creditsHint')}</Text>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

function SegOption({
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
    <Pressable onPress={onPress} style={[styles.seg, active && styles.segActive]}>
      <Ionicons name={icon} size={18} color={active ? brand.accent : brand.textMuted} />
      <Text style={[styles.segText, active && styles.segTextActive]}>{label}</Text>
    </Pressable>
  );
}

function deriveName(prompt: string): string {
  const words = prompt.trim().split(/\s+/).slice(0, 4).join(' ');
  return (words || 'New app').slice(0, 40);
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  content: { padding: space.lg },
  label: { color: brand.textMuted, fontSize: 13, fontWeight: '600', marginBottom: space.sm },
  segment: { flexDirection: 'row', gap: space.sm },
  seg: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingVertical: space.md,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: brand.border,
    backgroundColor: brand.surface,
  },
  segActive: { borderColor: brand.accent, backgroundColor: 'rgba(14,165,233,0.1)' },
  segText: { color: brand.textMuted, fontSize: 15, fontWeight: '600' },
  segTextActive: { color: brand.text },
  textarea: {
    minHeight: 120,
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    padding: space.md,
    color: brand.text,
    fontSize: 16,
    lineHeight: 22,
    textAlignVertical: 'top',
  },
  textareaFocused: { borderColor: brand.accent },
  error: { color: brand.danger, fontSize: 14, marginTop: space.md },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md + 2,
    marginTop: space.lg,
  },
  ctaPressed: { backgroundColor: brand.accentDim, transform: [{ scale: 0.95 }] },
  ctaDisabled: { opacity: 0.4 },
  ctaText: { color: brand.onAccent, fontSize: 16, fontWeight: '700' },
  hint: { color: brand.textFaint, fontSize: 12, lineHeight: 18, marginTop: space.md, textAlign: 'center' },
});
