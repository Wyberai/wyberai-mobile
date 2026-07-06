import { useEffect } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { supabase } from '@/lib/supabase';
import { Spinner } from '@/components/Spinner';
import { brand } from '@/lib/theme';

// OAuth deep-link landing route (wyberai://auth-callback?code=...).
//
// On iOS the in-app browser (openAuthSessionAsync in ctx/session.tsx) usually
// intercepts the redirect and exchanges the code inline, so this screen is never
// mounted. On Android the redirect frequently ESCAPES the browser and is handed
// to expo-router as a fresh deep link instead — with no route for it, the router
// rendered its "Unmatched Route" 404 and login silently dead-ended (the code was
// received but never exchanged). This route is that missing landing spot: it
// exchanges the code, then replaces itself so it never lingers in the back stack.
//
// Exchanging here is idempotent-safe: if the inline handler already used the
// (single-use PKCE) code, exchangeCodeForSession throws and we ignore it — the
// session is already set either way, and the root guard swaps to the app.
export default function AuthCallback() {
  const { code } = useLocalSearchParams<{ code?: string }>();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (typeof code === 'string' && code) {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // Already exchanged by the in-session browser handler — the session is
          // set; nothing to do but leave this screen.
        }
      }
      if (cancelled) return;
      // Land the user: if a session exists we go to the app root, otherwise back
      // to sign-in. The root-layout guard is the source of truth, so replacing to
      // '/' is enough — it resolves to (app) when authed, sign-in when not.
      router.replace('/');
    })();
    return () => {
      cancelled = true;
    };
  }, [code]);

  return (
    <View style={{ flex: 1, backgroundColor: brand.bg, alignItems: 'center', justifyContent: 'center' }}>
      <Spinner />
    </View>
  );
}
