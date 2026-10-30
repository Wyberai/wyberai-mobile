import { useEffect, useRef } from 'react';
import { useRouter } from 'expo-router';
import * as Notifications from 'expo-notifications';
import { useSession } from '@/ctx/session';

// Turns a tapped push into a screen. The backend (wyberai/src/lib/push.ts) sends
// `data: { type, ...payload }` on every message; we map that to a route. Handles
// BOTH a cold start (app launched by tapping a push) and warm taps (app already
// open). Also refreshes the credit balance when a balance-changing push lands in
// the foreground. Mount once, inside the signed-in tab layout.

type PushData = {
  type?: string;
  projectId?: string;
  [k: string]: unknown;
};

// Map a notification's data to an in-app path. Kept pure so it's trivially
// testable and easy to reason about.
export function routeForPush(data: PushData | undefined): string {
  const type = data?.type;
  const projectId = typeof data?.projectId === 'string' ? data.projectId : undefined;
  switch (type) {
    case 'build_complete':
    case 'published':
    case 'scheduled_agent_ran':
      return projectId ? `/project/${projectId}` : '/notifications';
    // Visitor error on a live app: the project screen shows the Fix it banner.
    case 'app_error':
      return projectId ? `/project/${projectId}` : '/notifications';
    // New pinned feedback: straight to the comments.
    case 'preview_comment':
      return projectId ? `/feedback/${projectId}` : '/notifications';
    case 'credits_low':
      return '/paywall';
    case 'referral':
      return '/account';
    default:
      return '/notifications';
  }
}

// Balance-changing pushes → refetch credits when received in the foreground.
const BALANCE_TYPES = new Set(['credits_low', 'referral']);

export function usePushNavigation() {
  const router = useRouter();
  const { session, refreshCredits } = useSession();
  // Guard against navigating twice for the same cold-start response.
  const handledColdStart = useRef(false);

  useEffect(() => {
    // Only wire this up for a signed-in user (routes live under the app group).
    if (!session) return;

    const go = (data: PushData | undefined) => {
      const path = routeForPush(data);
      // expo-router accepts a string path; cast to satisfy the typed router.
      router.push(path as never);
    };

    // Cold start: the app was launched by tapping a notification.
    if (!handledColdStart.current) {
      handledColdStart.current = true;
      Notifications.getLastNotificationResponseAsync()
        .then((response) => {
          const data = response?.notification.request.content.data as PushData | undefined;
          if (data) go(data);
        })
        .catch(() => {});
    }

    // Warm tap: app already running when the user taps a notification.
    const responseSub = Notifications.addNotificationResponseReceivedListener((response) => {
      const data = response.notification.request.content.data as PushData | undefined;
      go(data);
    });

    // Foreground receipt of a balance-changing push → refresh credits so the
    // balance the user sees is current without needing a manual pull.
    const receiveSub = Notifications.addNotificationReceivedListener((notification) => {
      const data = notification.request.content.data as PushData | undefined;
      if (data?.type && BALANCE_TYPES.has(data.type)) refreshCredits();
    });

    return () => {
      responseSub.remove();
      receiveSub.remove();
    };
  }, [session, router, refreshCredits]);
}
