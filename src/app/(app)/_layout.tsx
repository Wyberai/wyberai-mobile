import { Tabs, useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { brand, font } from '@/lib/theme';

export default function AppTabsLayout() {
  const router = useRouter();
  return (
    <Tabs
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
      <Tabs.Screen name="paywall" options={{ href: null, title: 'Upgrade' }} />
    </Tabs>
  );
}
