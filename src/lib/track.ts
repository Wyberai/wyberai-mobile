// Minimal client-side funnel tracking — no SDK, mirrors the web app's
// lib/track.ts. Posts straight to PostHog's HTTP capture endpoint (same
// public project key web uses); every path is try/caught so tracking can
// never affect product code. Requires EXPO_PUBLIC_POSTHOG_KEY to be set in
// the build — silently no-ops without it, same as web's guard.
//
// Only two of web's four funnel events (homepage_prompt_submitted →
// signup_completed → project_created → app_published) have a real mobile
// equivalent. homepage_prompt_submitted fires from web's public pre-signup
// marketing page — mobile has no such surface (the App Store listing is the
// mobile "homepage", not an in-app screen). signup_completed fires off a
// `?signup=1` URL param the web OAuth-callback redirect sets — mobile's auth
// flow has no equivalent reliable "this was a genuine new signup, not a
// returning sign-in" signal without deeper server changes. Forcing either
// onto an in-app trigger would double-count or misattribute events, which is
// worse than not tracking them — so this only wires project_created and
// app_published, both unambiguous in-app moments.

import AsyncStorage from '@react-native-async-storage/async-storage';

const DISTINCT_ID_KEY = 'wyber:analytics-did';
let cachedDistinctId: string | null = null;

async function distinctId(): Promise<string> {
  if (cachedDistinctId) return cachedDistinctId;
  let id = await AsyncStorage.getItem(DISTINCT_ID_KEY);
  if (!id) {
    id = `${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
    await AsyncStorage.setItem(DISTINCT_ID_KEY, id);
  }
  cachedDistinctId = id;
  return id;
}

export function track(event: string, props?: Record<string, unknown>): void {
  const key = process.env.EXPO_PUBLIC_POSTHOG_KEY;
  if (!key) return;
  const host = process.env.EXPO_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com';
  distinctId()
    .then((id) =>
      fetch(`${host.replace(/\/$/, '')}/capture/`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: key,
          event,
          distinct_id: id,
          properties: { ...props, platform: 'mobile' },
          timestamp: new Date().toISOString(),
        }),
      }),
    )
    .catch(() => {});
}
