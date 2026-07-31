// Deep-link URL rewriting for native (expo-router 57).
//
// OAuth on Android frequently ESCAPES the in-app browser: instead of
// openAuthSessionAsync intercepting the redirect, the OS delivers
// `wyberai://auth-callback?code=...` to the app as a system deep link. Expo
// Router would then try to route "/auth-callback" — a path with no screen — and
// render its stock "Unmatched Route" 404 (the bug behind the login dead-end).
//
// We rewrite that link to "/" so the router always lands on a real screen (the
// root guard shows sign-in until the session lands, then swaps to the app).
//
// The auth CODE is intentionally NOT exchanged here. ctx/session.tsx has a
// Linking listener (getInitialURL + "url" event) that receives the RAW OS url —
// untouched by this rewrite — and calls exchangeCodeForSession. Keeping this a
// pure path-rewrite avoids adding any screen to the navigator: a dedicated
// auth-callback route became the cold-start screen and hung on a spinner.
// Set whenever a `/project/:id` deep link is rewritten while the user might be
// signed out — Stack.Protected hides the (app) group entirely in that case, so
// the rewritten path below is silently dropped instead of navigated to. The
// root layout's RootNavigator watches this and replays the navigation once a
// session lands, instead of leaving the user stranded on the Home tab.
export let pendingDeepLinkPath: string | null = null;

export function clearPendingDeepLinkPath() {
  pendingDeepLinkPath = null;
}

export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    if (path.includes('auth-callback')) return '/';
    // wyberai://project/:id deep link — open straight to the preview screen
    const projectMatch = path.match(/^\/project\/([a-zA-Z0-9_-]+)/);
    if (projectMatch) {
      const rewritten = `/preview/${projectMatch[1]}`;
      pendingDeepLinkPath = rewritten;
      return rewritten;
    }
  } catch {
    // never throw from here — a throw can crash app launch
  }
  return null; // leave every other link unchanged
}
