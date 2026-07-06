# WyberAi — Companion App (Android-first)

The official WyberAi mobile app. Sign in, see your projects, open your live
apps, track build/publish/referral activity, and get push notifications — all
from your phone. Built with **Expo SDK 57** (latest stable) + Expo Router.

Backed by the **same Supabase project** as wyberai.com, so auth and data are
shared. The app reads `projects`, `profiles`, and `notifications` directly
through Row-Level Security (a user only ever sees their own rows).

## Stack

- Expo SDK 57 · React Native 0.86 · React 19
- Expo Router (file-based, typed routes)
- Supabase Auth (email OTP) + AsyncStorage session persistence
- expo-notifications (Expo push)

## Run it (instant, no build)

```bash
npm install
npx expo start
```

Scan the QR code with **Expo Go** on an Android device. Live-preview features
work in Expo Go; **push notifications require a dev/preview build** (see below).

## Project layout

```
src/
  app/
    _layout.tsx           # Session provider + auth-gated Stack.Protected routing
    sign-in.tsx           # Email OTP (send code → verify code)
    (app)/
      _layout.tsx         # Bottom tabs (Projects · Activity · Account)
      index.tsx           # Projects list (RLS query, pull-to-refresh)
      notifications.tsx   # Activity feed (auto marks read)
      account.tsx         # Credits, plan, quick links, sign out
      project/[id].tsx    # Detail — open live app, share, metadata
  ctx/session.tsx         # Supabase session context + push registration
  lib/
    supabase.ts           # Client (public prod values baked in)
    push.ts               # Expo push token registration → device_tokens
    theme.ts              # WyberAi dark brand tokens (#0EA5E9)
    types.ts              # Project / Profile / Notification shapes
```

## Build an Android APK (no Android Studio needed)

Uses Expo Application Services (EAS) cloud builds.

```bash
npm install -g eas-cli
eas login                 # your Expo account
eas init                  # links the project + writes extra.eas.projectId
eas build -p android --profile preview   # → installable APK
```

- `preview` profile → **APK** (side-load / internal testing)
- `production` profile → **AAB** (Google Play upload)

Profiles live in `eas.json`.

## Push notifications — required steps

1. Run `eas init` once. This writes `extra.eas.projectId` into the app config;
   without it, `getExpoPushTokenAsync` can't mint a token and registration
   no-ops silently (by design). See `src/lib/push.ts`.
2. Apply the DB migration in the main repo:
   `supabase/migrations/20260704160000_device_tokens.sql`.
3. The server fans out pushes via `src/lib/push.ts` → `notifyPush()` in the
   main repo, wired into the notification-insert sites.

Push tokens are only issued on real devices in a dev/preview/production build —
not in Expo Go or emulators.

## Config

`app.json` — name **WyberAi**, scheme `wyberai`, Android package
`com.wyberai.app`, dark UI, notification accent `#0EA5E9`.

The Supabase URL + anon key (both public) are baked into `src/lib/supabase.ts`,
so the app runs with no `.env`. To point at a different project, set
`EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` (see `.env.example`).
