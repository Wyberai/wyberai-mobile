import { Stack, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useRef, useState } from 'react';
import * as LocalAuthentication from 'expo-local-authentication';
import { View } from 'react-native';
import { useFonts } from 'expo-font';
import * as SplashScreen from 'expo-splash-screen';
import * as Updates from 'expo-updates';
import * as Sentry from '@sentry/react-native';
import NetInfo from '@react-native-community/netinfo';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SessionProvider, useSession } from '@/ctx/session';
import { LocaleProvider } from '@/lib/i18n/LocaleProvider';
import { Spinner } from '@/components/Spinner';
import { Onboarding, ONBOARDED_KEY } from '@/components/Onboarding';
import { ToastProvider } from '@/components/Toast';
import Constants from 'expo-constants';
import { AppErrorBoundary } from '@/components/AppErrorBoundary';
import { UpdateBanner } from '@/components/UpdateBanner';
import { OfflineScreen } from '@/components/OfflineScreen';
import { UpdateRequiredModal } from '@/components/UpdateRequiredModal';
import { BiometricLockScreen } from '@/components/BiometricLockScreen';
import { BrandedSplashOverlay } from '@/components/BrandedSplashOverlay';
import { WyberIcon } from '@/components/WyberIcon';
import { WyberWordmark } from '@/components/WyberWordmark';
import { brand } from '@/lib/theme';
import { isBelowMinVersion } from '@/lib/semver';
import { canUseBiometrics, getBiometricPreference } from '@/lib/biometric';
import { API_BASE } from '@/lib/api';
import { pendingDeepLinkPath, clearPendingDeepLinkPath } from './+native-intent';

SplashScreen.preventAutoHideAsync().catch(() => {});

Sentry.init({
  dsn: process.env.EXPO_PUBLIC_SENTRY_DSN,
  enabled: !!process.env.EXPO_PUBLIC_SENTRY_DSN,
  enableNative: true,
  tracesSampleRate: 0.2,
});

function RootLayout() {
  const [fontsLoaded] = useFonts({
    'GeneralSans-Bold': require('../../assets/fonts/GeneralSans-Bold.ttf'),
    'GeneralSans-Semibold': require('../../assets/fonts/GeneralSans-Semibold.ttf'),
  });
  const [isOnline, setIsOnline] = useState<boolean | null>(null);
  const [updateReady, setUpdateReady] = useState(false);
  const [updateRequired, setUpdateRequired] = useState(false);
  const [showBrandedSplash, setShowBrandedSplash] = useState(true);

  useEffect(() => {
    NetInfo.fetch().then((state) => setIsOnline(state.isConnected !== false));
    const sub = NetInfo.addEventListener((state) => setIsOnline(state.isConnected !== false));
    return () => sub();
  }, []);

  const checkForUpdate = useCallback(async () => {
    if (__DEV__ || !Updates.isEnabled) return;
    try {
      const result = await Updates.checkForUpdateAsync();
      if (result.isAvailable) {
        await Updates.fetchUpdateAsync();
        setUpdateReady(true);
      }
    } catch {
      // No network, no update server reachable, etc. — silently skip; this is
      // a background nicety, never something worth surfacing to the user.
    }
  }, []);

  const checkMinVersion = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/api/min-version`);
      const data = await res.json();
      const current = Constants.expoConfig?.version ?? '0.0.0';
      if (typeof data.minVersion === 'string' && isBelowMinVersion(current, data.minVersion)) {
        setUpdateRequired(true);
      }
    } catch {
      // Can't reach the version-check endpoint — never block the app on this.
    }
  }, []);

  useEffect(() => {
    if (fontsLoaded) {
      SplashScreen.hideAsync().catch(() => {});
      // Both fully async (network check → setState in a .then) — nothing here
      // sets state synchronously in this render.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      checkForUpdate();
      checkMinVersion();
    }
  }, [fontsLoaded, checkForUpdate, checkMinVersion]);

  if (!fontsLoaded) return null;

  const body =
    isOnline === false ? (
      <View style={{ flex: 1, backgroundColor: brand.bg }}>
        <StatusBar style="light" />
        <OfflineScreen onRetry={() => NetInfo.fetch().then((state) => setIsOnline(state.isConnected !== false))} />
      </View>
    ) : (
      <AppErrorBoundary>
        <LocaleProvider>
          <SessionProvider>
            <ToastProvider>
              <StatusBar style="light" />
              <RootNavigator />
              {updateReady ? (
                <UpdateBanner onReload={() => Updates.reloadAsync().catch(() => {})} />
              ) : null}
              <UpdateRequiredModal visible={updateRequired} />
            </ToastProvider>
          </SessionProvider>
        </LocaleProvider>
      </AppErrorBoundary>
    );

  return (
    <>
      {body}
      {showBrandedSplash ? <BrandedSplashOverlay onDone={() => setShowBrandedSplash(false)} /> : null}
    </>
  );
}

function RootNavigator() {
  const { session, isLoading, signOut } = useSession();
  const router = useRouter();
  // First-launch tour: null = still reading the flag (blocks nothing visible —
  // it resolves in ms, well before auth). Only shown signed-out.
  const [onboarded, setOnboarded] = useState<boolean | null>(null);

  useEffect(() => {
    AsyncStorage.getItem(ONBOARDED_KEY)
      .then((v) => setOnboarded(v === '1'))
      .catch(() => setOnboarded(true)); // storage broken → never trap the user in the tour
  }, []);

  // Redirect-after-login: a `/project/:id` deep link that arrived while signed
  // out gets rewritten by +native-intent but silently dropped (Stack.Protected
  // hides the (app) group when there's no session). Once a session lands,
  // replay that navigation instead of stranding the user on the Home tab.
  useEffect(() => {
    if (!session || !pendingDeepLinkPath) return;
    const target = pendingDeepLinkPath;
    clearPendingDeepLinkPath();
    router.replace(target as Href);
  }, [session, router]);

  // Biometric gate — checked once per cold start (not on every token-refresh
  // re-render of `session`), and only if the user opted in from the sign-in
  // prompt (ctx/session.tsx offerBiometricOptIn). Critical for the QR
  // deep-link flow: unlocking with a glance beats typing an OTP.
  const biometricChecked = useRef(false);
  const [biometricGate, setBiometricGate] = useState<'checking' | 'required' | 'passed' | 'off'>('checking');

  const runBiometricCheck = useCallback(() => {
    // Re-check hardware/enrollment on every attempt, not just at opt-in time —
    // a user can remove their last fingerprint/Face ID after opting in, which
    // must never turn into a permanent lockout with no way back into the app.
    canUseBiometrics().then((available) => {
      if (!available) {
        setBiometricGate('off');
        return;
      }
      LocalAuthentication.authenticateAsync({ promptMessage: 'Unlock WyberAi' }).then((result) => {
        setBiometricGate(result.success ? 'passed' : 'required');
      });
    });
  }, []);

  useEffect(() => {
    if (!session || biometricChecked.current) return;
    biometricChecked.current = true;
    getBiometricPreference().then((pref) => {
      if (pref === true) {
        setBiometricGate('required');
        runBiometricCheck();
      } else {
        setBiometricGate('off');
      }
    });
  }, [session, runBiometricCheck]);

  if (isLoading || onboarded === null) {
    // Matches BrandedSplashOverlay's settled frame (icon + wordmark, same
    // dark background) instead of a bare spinner — the overlay's own ~900ms
    // entrance animation has no idea how long session/onboarded resolution
    // actually takes, so if this is reached before that data is ready, it
    // must look like a continuation of the splash, not a downgrade to a
    // generic loading screen.
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: brand.bg,
          alignItems: 'center',
          justifyContent: 'center',
          gap: 14,
        }}
      >
        <WyberIcon size={56} />
        <WyberWordmark width={130} />
        <View style={{ marginTop: 10 }}>
          <Spinner />
        </View>
      </View>
    );
  }

  if (!session && !onboarded) {
    return <Onboarding onDone={() => setOnboarded(true)} />;
  }

  if (session && biometricGate === 'required') {
    return <BiometricLockScreen onRetry={runBiometricCheck} onSignOut={signOut} />;
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
      {/* Public route — reachable regardless of auth state (reviewer + pre-signup reads). */}
      <Stack.Screen name="privacy" options={{ headerShown: true, presentation: 'modal' }} />
    </Stack>
  );
}

export default Sentry.wrap(RootLayout);
