import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { supabase } from './supabase';

// Foreground behaviour: show the banner + list entry, no sound/badge noise.
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldPlaySound: false,
    shouldSetBadge: false,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

// Pull the EAS projectId that `eas init` writes into app config. Push tokens
// can't be minted without it, so we no-op cleanly until the project is linked.
function getProjectId(): string | undefined {
  const cfg = Constants as unknown as {
    expoConfig?: { extra?: { eas?: { projectId?: string } } };
    easConfig?: { projectId?: string };
  };
  return cfg.expoConfig?.extra?.eas?.projectId ?? cfg.easConfig?.projectId;
}

/**
 * Ask for permission, mint an Expo push token, and upsert it into the shared
 * `device_tokens` table (RLS-scoped to the signed-in user). Best-effort: any
 * failure is swallowed so it can never block sign-in. Returns the token or null.
 */
export async function registerForPushNotifications(userId: string): Promise<string | null> {
  try {
    if (!Device.isDevice) return null; // no push on simulators/emulators

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'WyberAi',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#0EA5E9',
      });
    }

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;
    if (status !== 'granted') {
      const req = await Notifications.requestPermissionsAsync();
      status = req.status;
    }
    if (status !== 'granted') return null;

    const projectId = getProjectId();
    if (!projectId) return null; // not linked to EAS yet — skip silently

    const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;

    await supabase.from('device_tokens').upsert(
      {
        user_id: userId,
        token,
        platform: Platform.OS,
      },
      { onConflict: 'token' },
    );

    return token;
  } catch {
    return null;
  }
}
