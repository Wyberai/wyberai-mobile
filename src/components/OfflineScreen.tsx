import { View, Text, Pressable, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, font, radius, space } from '@/lib/theme';

export function OfflineScreen({ onRetry }: { onRetry: () => void }) {
  return (
    <View style={styles.container}>
      <Ionicons name="cloud-offline-outline" size={48} color={brand.textFaint} />
      <Text style={styles.title}>No internet connection</Text>
      <Text style={styles.subtitle}>WyberAi needs a connection to build and preview apps.</Text>
      <Pressable style={styles.button} onPress={onRetry}>
        <Text style={styles.buttonText}>Retry</Text>
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
    paddingHorizontal: space.xl,
    gap: space.sm,
  },
  title: { fontFamily: font.display, fontSize: 18, color: brand.text, marginTop: space.md },
  subtitle: { fontSize: 14, color: brand.textMuted, textAlign: 'center', marginBottom: space.lg, lineHeight: 20 },
  button: {
    backgroundColor: brand.surface,
    borderColor: brand.border,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
  },
  buttonText: { fontFamily: font.displayMedium, color: brand.text, fontSize: 15 },
});
