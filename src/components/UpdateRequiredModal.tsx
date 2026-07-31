import { Modal, Platform, Pressable, Text, View, StyleSheet, Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, font, radius, space } from '@/lib/theme';

// No iOS App Store listing exists yet (see app.json buildNumber:1 — pre-launch)
// — falls back to the Play listing / marketing site until App Store Connect
// assigns a real numeric app id to put here.
const STORE_URL = Platform.select({
  android: 'https://play.google.com/store/apps/details?id=com.wyberai.app',
  default: 'https://wyberai.com',
});

// Non-dismissable — the only way out is to update. Fetched min-version from
// /api/min-version (a static JSON route, no app-binary deploy needed to
// bump it) beats everyone below it into updating without an app-store review.
export function UpdateRequiredModal({ visible }: { visible: boolean }) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={() => {}}>
      <View style={styles.scrim}>
        <View style={styles.card}>
          <Ionicons name="arrow-up-circle" size={40} color={brand.accent} />
          <Text style={styles.title}>Update required</Text>
          <Text style={styles.body}>
            This version of WyberAi is no longer supported. Update to keep building.
          </Text>
          <Pressable style={styles.button} onPress={() => Linking.openURL(STORE_URL!)}>
            <Text style={styles.buttonText}>Update now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  scrim: {
    flex: 1,
    backgroundColor: 'rgba(6,6,10,0.85)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: space.xl,
  },
  card: {
    width: '100%',
    backgroundColor: brand.surface,
    borderWidth: 1,
    borderColor: brand.border,
    borderRadius: radius.lg,
    padding: space.xl,
    alignItems: 'center',
    gap: space.sm,
  },
  title: { color: brand.text, fontSize: 19, fontFamily: font.display },
  body: { color: brand.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20, marginBottom: space.sm },
  button: {
    backgroundColor: brand.accent,
    borderRadius: radius.md,
    paddingVertical: space.md,
    paddingHorizontal: space.xxl,
  },
  buttonText: { color: brand.onAccent, fontSize: 15, fontWeight: '700' },
});
