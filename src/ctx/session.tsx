import { createContext, useContext, useEffect, useRef, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { AppState } from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as Linking from 'expo-linking';
import * as AppleAuthentication from 'expo-apple-authentication';
import { supabase } from '@/lib/supabase';
import { registerForPushNotifications } from '@/lib/push';

export type OAuthProvider = 'google' | 'github';

type SessionContextValue = {
  session: Session | null;
  user: User | null;
  isLoading: boolean;
  /** Sign in with Google or GitHub (opens a browser session, returns to the app). */
  signInWithProvider: (provider: OAuthProvider) => Promise<{ error: string | null }>;
  /** Native Sign in with Apple (iOS only). Required by Apple 4.8 alongside social. */
  signInWithApple: () => Promise<{ error: string | null }>;
  /** Send an email login code. Creates the account if new. */
  sendCode: (email: string) => Promise<{ error: string | null }>;
  /** Verify the emailed 6-digit code and establish a session. */
  verifyCode: (email: string, code: string) => Promise<{ error: string | null }>;
  /**
   * Password sign-in. Normal users have no password and use OTP; this exists so
   * the App Store / Play reviewer account (which can't receive an OTP email) can
   * sign in with credentials we hand the reviewer. See sign-in.tsx REVIEW_EMAIL.
   */
  signInWithPassword: (email: string, password: string) => Promise<{ error: string | null }>;
  signOut: () => Promise<void>;
};

const SessionContext = createContext<SessionContextValue | undefined>(undefined);

export function useSession() {
  const ctx = useContext(SessionContext);
  if (!ctx) throw new Error('useSession must be used within <SessionProvider>');
  return ctx;
}

export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const registeredFor = useRef<string | null>(null);

  useEffect(() => {
    let settled = false;
    const finishLoading = () => {
      if (!settled) {
        settled = true;
        setIsLoading(false);
      }
    };

    // Resolve the loading state no matter what — a rejected/hung getSession must
    // never trap the app on the loading screen.
    supabase.auth
      .getSession()
      .then(({ data }) => setSession(data.session))
      .catch(() => {})
      .finally(finishLoading);
    const safety = setTimeout(finishLoading, 4000);

    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      finishLoading();
    });

    // Supabase's recommended RN pattern: only auto-refresh while foregrounded.
    const appStateSub = AppState.addEventListener('change', (state) => {
      if (state === 'active') supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });

    return () => {
      clearTimeout(safety);
      sub.subscription.unsubscribe();
      appStateSub.remove();
    };
  }, []);

  // Catch OAuth redirects that arrive as a deep link (wyberai://auth-callback
  // ?code=...) when the in-session browser hands off instead of being intercepted.
  // Exchanging here lands the session; onAuthStateChange swaps to the app. No
  // dedicated route — a route here would become the cold-start screen and hang.
  useEffect(() => {
    const exchange = async (url: string | null) => {
      if (!url || !url.includes('auth-callback')) return;
      const code = Linking.parse(url).queryParams?.code;
      if (typeof code === 'string') {
        try {
          await supabase.auth.exchangeCodeForSession(code);
        } catch {
          // already exchanged by the in-session handler — ignore
        }
      }
    };
    Linking.getInitialURL().then(exchange);
    const sub = Linking.addEventListener('url', ({ url }) => exchange(url));
    return () => sub.remove();
  }, []);

  // Register this device for push once per signed-in user.
  useEffect(() => {
    const uid = session?.user?.id;
    if (uid && registeredFor.current !== uid) {
      registeredFor.current = uid;
      registerForPushNotifications(uid);
    }
    if (!uid) registeredFor.current = null;
  }, [session?.user?.id]);

  async function signInWithProvider(provider: OAuthProvider) {
    try {
      // Deep link the OAuth redirect back into the app (scheme "wyberai").
      const redirectTo = Linking.createURL('auth-callback');
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider,
        options: { redirectTo, skipBrowserRedirect: true },
      });
      if (error) return { error: error.message };
      if (!data?.url) return { error: 'Could not start sign-in.' };

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      // User closed the browser without finishing — not an error.
      if (result.type !== 'success') return { error: null };

      const code = Linking.parse(result.url).queryParams?.code;
      if (typeof code !== 'string') return { error: 'Sign-in was not completed.' };

      const { error: exErr } = await supabase.auth.exchangeCodeForSession(code);
      return { error: exErr?.message ?? null };
    } catch (e: any) {
      return { error: e?.message ?? 'Sign-in failed.' };
    }
  }

  async function signInWithApple() {
    try {
      const credential = await AppleAuthentication.signInAsync({
        requestedScopes: [
          AppleAuthentication.AppleAuthenticationScope.FULL_NAME,
          AppleAuthentication.AppleAuthenticationScope.EMAIL,
        ],
      });
      if (!credential.identityToken) return { error: 'Apple did not return an identity token.' };
      const { error } = await supabase.auth.signInWithIdToken({
        provider: 'apple',
        token: credential.identityToken,
      });
      return { error: error?.message ?? null };
    } catch (e: any) {
      // User cancelled the native sheet — not an error.
      if (e?.code === 'ERR_REQUEST_CANCELED') return { error: null };
      return { error: e?.message ?? 'Apple sign-in failed.' };
    }
  }

  async function sendCode(email: string) {
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim().toLowerCase(),
    });
    return { error: error?.message ?? null };
  }

  async function verifyCode(email: string, code: string) {
    const { error } = await supabase.auth.verifyOtp({
      email: email.trim().toLowerCase(),
      token: code.trim(),
      type: 'email',
    });
    return { error: error?.message ?? null };
  }

  async function signInWithPassword(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(),
      password,
    });
    return { error: error?.message ?? null };
  }

  async function signOut() {
    await supabase.auth.signOut();
  }

  return (
    <SessionContext.Provider
      value={{
        session,
        user: session?.user ?? null,
        isLoading,
        signInWithProvider,
        signInWithApple,
        sendCode,
        verifyCode,
        signInWithPassword,
        signOut,
      }}
    >
      {children}
    </SessionContext.Provider>
  );
}
