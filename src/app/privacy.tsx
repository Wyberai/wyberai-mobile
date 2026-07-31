import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { WebView } from 'react-native-webview';
import { Stack, useLocalSearchParams } from 'expo-router';
import { brand } from '@/lib/theme';

// Public route (outside the (app) auth guard) — reachable signed-in or signed-out
// so a reviewer or a signed-out user can read the policy before creating an account.
export default function PrivacyScreen() {
  const { doc } = useLocalSearchParams<{ doc?: string }>();
  const isTerms = doc === 'terms';
  const uri = isTerms ? 'https://wyberai.com/terms' : 'https://wyberai.com/privacy';

  return (
    <View style={styles.flex}>
      <Stack.Screen options={{ headerShown: true, title: isTerms ? 'Terms of Service' : 'Privacy Policy' }} />
      <WebView
        source={{ uri }}
        style={styles.flex}
        startInLoadingState
        renderLoading={() => (
          <View style={styles.loading}>
            <ActivityIndicator color={brand.accent} />
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: brand.bg },
  loading: { ...StyleSheet.absoluteFill, alignItems: 'center', justifyContent: 'center', backgroundColor: brand.bg },
});
