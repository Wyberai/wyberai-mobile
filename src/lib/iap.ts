import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { PurchasesPackage } from 'react-native-purchases';

// react-native-purchases is a NATIVE module — it doesn't exist in Expo Go.
// Every call is guarded so the rest of the app keeps working there; IAP only
// comes alive in a real dev/preview/production build.
const isExpoGo = Constants.executionEnvironment === 'storeClient';

let Purchases: typeof import('react-native-purchases').default | null = null;
if (!isExpoGo) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    Purchases = require('react-native-purchases').default;
  } catch {
    Purchases = null;
  }
}

// Real store keys take precedence once the App Store / Play apps exist; the
// RevenueCat Test Store key is a DEV-ONLY fallback. Shipping a `test_` key in a
// release build is fatal: RevenueCat's SDK force-closes the app the moment it
// sees a test key against real Play Billing ("to protect the security of test
// purchases"). So the test key is gated on `__DEV__` (false in a Metro
// bundleRelease) and never leaks into production.
const IOS_KEY = process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY ?? '';
const ANDROID_KEY = process.env.EXPO_PUBLIC_REVENUECAT_ANDROID_KEY ?? '';
const TEST_KEY = process.env.EXPO_PUBLIC_REVENUECAT_TEST_KEY ?? 'test_qckKDIiCKdPxyAhFEvoJYiWoTOC';
const ENTITLEMENT = 'pro';

// Optional kill-switch: only OFF when explicitly disabled. Real-key presence is
// the real gate, so we don't depend on this variable being set.
const iapDisabled = ['false', '0'].includes(
  (process.env.EXPO_PUBLIC_ENABLE_IAP ?? '').toLowerCase(),
);

// The key actually used to configure RevenueCat. In production a missing real
// key resolves to '' (never the test key), so the app degrades to the paywall's
// calm "install the app" notice instead of crashing.
const REAL_KEY = Platform.OS === 'ios' ? IOS_KEY : ANDROID_KEY;
const API_KEY = REAL_KEY || (__DEV__ ? TEST_KEY : '');

// IAP is usable only when the native module loaded, a key exists, and it's not
// killed. `isIapAvailable()` reflects this so the UI never offers a purchase it
// can't complete.
const iapReady = Purchases !== null && !!API_KEY && !iapDisabled;

export function isIapAvailable(): boolean {
  return iapReady;
}

let configured = false;

/** Configure RevenueCat with the Supabase user id as the app_user_id. */
export async function configureIap(userId: string): Promise<void> {
  if (!Purchases || !iapReady) return;
  try {
    if (!configured) {
      Purchases.configure({ apiKey: API_KEY, appUserID: userId });
      configured = true;
    } else {
      await Purchases.logIn(userId);
    }
  } catch (e) {
    console.warn('[iap] configure failed', e);
  }
}

/** The purchasable packages in the current offering (empty if unavailable). */
export async function getOfferingPackages(): Promise<PurchasesPackage[]> {
  if (!Purchases) return [];
  try {
    const offerings = await Purchases.getOfferings();
    return offerings.current?.availablePackages ?? [];
  } catch (e) {
    console.warn('[iap] getOfferings failed', e);
    return [];
  }
}

export type PurchaseOutcome =
  | { ok: true; isPro: boolean }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled?: false; error: string };

export async function purchasePackage(pkg: PurchasesPackage): Promise<PurchaseOutcome> {
  if (!Purchases) return { ok: false, error: 'In-app purchases require the installed app.' };
  try {
    const { customerInfo } = await Purchases.purchasePackage(pkg);
    return { ok: true, isPro: !!customerInfo.entitlements.active[ENTITLEMENT] };
  } catch (e: any) {
    if (e?.userCancelled) return { ok: false, cancelled: true };
    return { ok: false, error: e?.message ?? 'Purchase failed' };
  }
}

export async function restorePurchases(): Promise<{ ok: boolean; isPro?: boolean; error?: string }> {
  if (!Purchases) return { ok: false, error: 'Not available' };
  try {
    const info = await Purchases.restorePurchases();
    return { ok: true, isPro: !!info.entitlements.active[ENTITLEMENT] };
  } catch (e: any) {
    return { ok: false, error: e?.message ?? 'Restore failed' };
  }
}
