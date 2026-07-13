import { Tabs, useRouter } from 'expo-router';
import { Pressable, Text } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, font } from '@/lib/theme';
import { usePushNavigation } from '@/lib/usePushNavigation';

export default function AppTabsLayout() {
  const router = useRouter();
  // Route tapped push notifications to the right screen (build→project,
  // credits_low→paywall, etc.). Side-effect only; renders nothing.
  usePushNavigation();
  return (
    <Tabs
      initialRouteName="home"
      screenOptions={{
        headerStyle: { backgroundColor: brand.bg },
        headerTitleStyle: { color: brand.text, fontFamily: font.display },
        headerShadowVisible: false,
        tabBarActiveTintColor: brand.accent,
        tabBarInactiveTintColor: brand.textFaint,
        tabBarStyle: {
          backgroundColor: brand.surface,
          borderTopColor: brand.border,
        },
        sceneStyle: { backgroundColor: brand.bg },
      }}
    >
      <Tabs.Screen
        name="home"
        options={{
          title: 'Home',
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
          title: 'Projects',
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
          title: 'Activity',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="notifications-outline" size={size} color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="account"
        options={{
          title: 'Account',
          tabBarIcon: ({ color, size }) => (
            <Ionicons name="person-circle-outline" size={size} color={color} />
          ),
        }}
      />
      {/* These routes live in this group but are hidden from the tab bar. */}
      <Tabs.Screen name="project/[id]" options={{ href: null, title: 'Project' }} />
      <Tabs.Screen name="new" options={{ href: null, title: 'New app' }} />
      <Tabs.Screen name="build/[id]" options={{ href: null, title: 'Builder' }} />
      <Tabs.Screen name="preview/[id]" options={{ href: null, title: 'Preview' }} />
      <Tabs.Screen name="paywall" options={{ href: null, title: 'Get credits' }} />
      <Tabs.Screen name="themes/[id]" options={{ href: null, title: 'Themes' }} />
      <Tabs.Screen name="versions/[id]" options={{ href: null, title: 'Version history' }} />
      <Tabs.Screen name="code/[id]" options={{ href: null, title: 'Code' }} />
    </Tabs>
  );
}
