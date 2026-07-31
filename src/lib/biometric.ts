import * as SecureStore from 'expo-secure-store';
import * as LocalAuthentication from 'expo-local-authentication';

const FLAG_KEY = 'wyber:biometric-enabled';

/** null = never asked, true = opted in, false = declined. */
export async function getBiometricPreference(): Promise<boolean | null> {
  const v = await SecureStore.getItemAsync(FLAG_KEY);
  if (v === null) return null;
  return v === '1';
}

export async function setBiometricPreference(enabled: boolean): Promise<void> {
  await SecureStore.setItemAsync(FLAG_KEY, enabled ? '1' : '0');
}

export async function canUseBiometrics(): Promise<boolean> {
  const hasHardware = await LocalAuthentication.hasHardwareAsync();
  if (!hasHardware) return false;
  return LocalAuthentication.isEnrolledAsync();
}
