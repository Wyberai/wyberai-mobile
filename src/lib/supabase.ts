import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient } from '@supabase/supabase-js';

// These are PUBLIC values (same anon key already shipped in the web bundle).
// Override per-environment via EXPO_PUBLIC_* in a local .env if you ever point
// the app at a staging project.
const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL ?? 'https://api.wyberai.com';
const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRheWhvb3poamNicHB5eGRoeXVhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3Nzk1MDQ5OTMsImV4cCI6MjA5NTA4MDk5M30.ZRVbcyUHmFRkMsPC1Ijsg2JuerJcBtcNAzjFDPSH7y4';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    // React Native session persistence. AsyncStorage (not SecureStore) because
    // Supabase sessions can exceed SecureStore's 2KB per-key limit.
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    // No URL-based session detection on native (that's a web-only concept).
    detectSessionInUrl: false,
    // PKCE is required for the native OAuth flow (Google/GitHub via a browser
    // session that redirects back into the app with a ?code to exchange).
    flowType: 'pkce',
  },
});
