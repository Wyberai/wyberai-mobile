import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionProvider, useSession } from '@/ctx/session';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { Spinner } from '@/components/Spinner';
import { Onboarding, ONBOARDED_KEY } from '@/components/Onboarding';
import { ToastProvider } from '@/components/Toast';
import { brand } from '@/lib/theme';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'GeneralSans-Bold': require('../../assets/fonts/GeneralSans-Bold.ttf'),
    'GeneralSans-Semibold': require('../../assets/fonts/GeneralSans-Semibold.ttf'),
  });

  useEffect(() => {
    if (fontsLoaded) SplashScreen.hideAsync().catch(() => {});
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <LocaleProvider>
      <SessionProvider>
        <ToastProvider>
          <StatusBar style="light" />
          <RootNavigator />
        </ToastProvider>
      </SessionProvider>
    </LocaleProvider>
  );
}

function RootNavigator() {
  const { session, isLoading } = useSession();
  // First-launch tour: null = still reading the flag (blocks nothing visible —
  // it resolves in ms, well before auth). Only shown signed-out.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true)); // storage broken → never trap the user in the tour
  }, []);

  if (isLoading || onboarded === null) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: brand.bg,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Spinner />
      </View>
    );
  }

  if (!session && !onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  return (
    <Stack
      screenOptions={{
        headerShown: false,
        contentStyle: { backgroundColor: brand.bg },
      }}
    >
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(app)" />
      </Stack.Protected>
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
      </Stack.Protected>
    </Stack>
  );
}
