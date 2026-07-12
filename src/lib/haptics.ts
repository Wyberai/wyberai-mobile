// Tiny haptics wrapper — every call is fire-and-forget and guarded, so screens
// can sprinkle feedback without caring whether the platform (web preview,
// simulators without Taptic) actually supports it.
import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const enabled = Platform.OS === 'ios' || Platform.OS === 'android';

/** Light tick for taps on primary actions. */
export function tap(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
}

/** Medium thunk for significant actions (start build, apply theme). */
export function thunk(): void {
  if (!enabled) return;
  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {});
}

/** Success notification (purchase complete, published). */
export function success(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
}

/** Warning/error notification (build failed, out of credits). */
export function warn(): void {
  if (!enabled) return;
  Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
}
