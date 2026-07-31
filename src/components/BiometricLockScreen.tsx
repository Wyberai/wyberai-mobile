import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, font, radius, space } from '@/lib/theme';

export function BiometricLockScreen({
  onRetry,
  onSignOut,
}: {
  onRetry: () => void;
  onSignOut: () => void;
}) {
  return (
    <View style={styles.container}>
      <Ionicons name="finger-print-outline" size={48} color={brand.accent} />
      <Text style={styles.title}>Unlock WyberAi</Text>
      <Text style={styles.subtitle}>Confirm it&apos;s you to continue.</Text>
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Try again</Text>
      </Pressable>
      {/* Escape hatch — a device that loses biometric enrollment, or a user who
          keeps cancelling the prompt, must never be trapped with no way back in. */}
      <Pressable style={styles.signOutButton} onPress={onSignOut}>
        <Text style={styles.signOutText}>Sign out instead</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: brand.bg,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.sm,
    paddingHorizontal: space.xl,
  },
  title: { fontFamily: font.display, fontSize: 19, color: brand.text, marginTop: space.md },
  subtitle: { fontSize: 14, color: brand.textMuted, marginBottom: space.lg },
  button: {
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
  },
  buttonText: { fontFamily: font.displayMedium, color: brand.onAccent, fontSize: 15 },
  signOutButton: { marginTop: space.md, paddingVertical: space.sm, paddingHorizontal: space.lg },
  signOutText: { color: brand.textMuted, fontSize: 14, fontWeight: '600' },
});
