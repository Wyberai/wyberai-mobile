import { Tabs, useRouter } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { brand, font } from '@/lib/theme';
import { usePushNavigation } from '@/lib/usePushNavigation';
import { useT } from '@/lib/i18n/useT';
import { TABS_STRINGS } from '@/lib/i18n/dict/tabs';
import { PROJECT_DETAIL_STRINGS } from '@/lib/i18n/dict/project-detail';
import { NEW_APP_STRINGS } from '@/lib/i18n/dict/new-app';
import { BUILD_SCREEN_STRINGS } from '@/lib/i18n/dict/build-screen';
import { PREVIEW_SCREEN_STRINGS } from '@/lib/i18n/dict/preview-screen';
import { PAYWALL_STRINGS } from '@/lib/i18n/dict/paywall';
import { THEMES_SCREEN_STRINGS } from '@/lib/i18n/dict/themes-screen';
import { VERSIONS_SCREEN_STRINGS } from '@/lib/i18n/dict/versions-screen';
import { CODE_SCREEN_STRINGS } from '@/lib/i18n/dict/code-screen';

export default function AppTabsLayout() {
  const router = useRouter();
  // Route tapped push notifications to the right screen (build→project,
  // credits_low→paywall, etc.). Side-effect only; renders nothing.
  usePushNavigation();
  // Native tab bar labels and header titles are react-navigation `options`
  // string props, not JSX — each hidden-route title here is a fallback shown
  // briefly before that screen's own Stack.Screen title paints, so it needs
  // the same translation as the screen itself.
  const t = useT(TABS_STRINGS);
  const tProject = useT(PROJECT_DETAIL_STRINGS);
  const tNew = useT(NEW_APP_STRINGS);
  const tBuild = useT(BUILD_SCREEN_STRINGS);
  const tPreview = useT(PREVIEW_SCREEN_STRINGS);
  const tPaywall = useT(PAYWALL_STRINGS);
  const tThemes = useT(THEMES_SCREEN_STRINGS);
  const tVersions = useT(VERSIONS_SCREEN_STRINGS);
  const tCode = useT(CODE_SCREEN_STRINGS);
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerStyle: { backgroundColor: brand.bg },
        headerTitleStyle: { color: brand.text, fontFamily: font.display },
        headerShadowVisible: false,
        tabBarActiveTintColor: brand.accent,
        tabBarInactiveTintColor: brand.textFaint,
        // Subtle vertical gradient instead of a flat surface — reads as depth
        // without blur (expo-blur isn't installed; expo-glass-effect is
        // iOS-only and this release ships Android — both are iOS candidates).
        tabBarStyle: {
          backgroundColor: 'transparent',
          borderTopColor: brand.border,
        },
        tabBarBackground: () => (
          <LinearGradient
            colors={[brand.surface, '#0C0C10F5']}
            style={StyleSheet.absoluteFill}
          />
        ),
        sceneStyle: { backgroundColor: brand.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: t('home'),
          // The Home screen carries its own branding in the hero; the header
          // shows the wordmark for identity without doubling the title.
          headerTitle: () => (
            <Text style={{ color: brand.text, fontSize: 20, fontFamily: font.display, letterSpacing: -0.5 }}>
              Wyber<Text style={{ color: brand.accent }}>Ai</Text>
            </Text>
          ),
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="index"
        options={{
          title: t('projects'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="grid-outline" size={size} color={color} />
          ),
          headerRight: () => (
            <Pressable
              onPress={() => router.push('/new')}
              hitSlop={10}
              style={{ paddingHorizontal: 12 } as never}
            >
              <Ionicons name="add-circle" size={26} color={brand.accent} />
            </Pressable>
          ),
        }}
      />
      <Tabs.Screen
        name="notifications"
        options={{
          title: t('activity'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: t('account'),
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      {/* These routes live in this group but are hidden from the tab bar. */}
      <Tabs.Screen name="project/[id]" options={{ href: null, title: tProject('project') }} />
      <Tabs.Screen name="new" options={{ href: null, title: tNew('screenTitle') }} />
      <Tabs.Screen name="build/[id]" options={{ href: null, title: tBuild('builder') }} />
      <Tabs.Screen name="preview/[id]" options={{ href: null, title: tPreview('preview') }} />
      <Tabs.Screen name="paywall" options={{ href: null, title: tPaywall('getCredits') }} />
      <Tabs.Screen name="themes/[id]" options={{ href: null, title: tThemes('themes') }} />
      <Tabs.Screen name="versions/[id]" options={{ href: null, title: tVersions('versionHistory') }} />
      <Tabs.Screen name="code/[id]" options={{ href: null, title: tCode('code') }} />
    </Tabs>
  );
}
