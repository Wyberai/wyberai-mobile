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
export function redirectSystemPath({ path }: { path: string; initial: boolean }): string | null {
  try {
    if (path.includes('auth-callback')) return '/';
    // wyberai://project/:id deep link — open straight to the preview screen
    const projectMatch = path.match(/^\/project\/([a-zA-Z0-9_-]+)/);
    if (projectMatch) return `/preview/${projectMatch[1]}`;
  } catch {
    // never throw from here — a throw can crash app launch
  }
  return null; // leave every other link unchanged
}
