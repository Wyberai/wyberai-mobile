# WyberAi — Companion App (Android-first, v2+)

The official WyberAi mobile app — feature-parity with the web editor. Build,
chat, preview, publish, and monetize apps directly from your phone. 
Built with **Expo SDK 57** (latest stable) + Expo Router.

**v2 features:** persistent chat history, version snapshots + restore, code
viewer, 0-credit themes, conversion-grade paywall, community gallery,
first-launch onboarding, haptic feedback, and in-app credit purchases via
Google Play Billing.

Backed by the **same Supabase project** as wyberai.com, so auth and data are
shared. The app reads `projects`, `profiles`, and related tables directly
through Row-Level Security (a user only ever sees their own rows).
RevenueCat integration handles receipt validation + webhook-driven credit grants.

## Stack

- **Runtime:** Expo SDK 57 · React Native 0.86 · React 19
- **Routing:** Expo Router (file-based, typed routes)
- **Auth:** Supabase Auth (email OTP) + AsyncStorage session persistence
- **DB:** Supabase (direct RLS queries + webhooks)
- **Payments:** RevenueCat (receipt validation) + Google Play Billing (in-app consumables)
- **UI:** React Native `StyleSheet` + shared brand tokens (`lib/theme.ts`), expo-linear-gradient (backgrounds + overlays), General Sans display font (self-hosted)
- **Haptics:** expo-haptics (tap/success/warn feedback)
- **Push:** Expo push notifications (optional — dev builds only)

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
    _layout.tsx             # Onboarding guard (AsyncStorage wyber:onboarded)
    sign-in.tsx             # Email OTP (send code → verify code)
    (app)/
      _layout.tsx           # Bottom tabs (Home · Projects · Activity · Account)
      index.tsx             # Home: hero prompt + template chips + community gallery
      projects.tsx          # Projects list (RLS query, pull-to-refresh, rename/delete)
      activity.tsx          # Activity feed (auto marks read)
      account.tsx           # Credits, plan, quick links, sign out, credit activity
      build/[id]/
        index.tsx           # Chat + builder (streaming edits via /api/generate)
        preview.tsx         # Web + Mobile (RN-web) inline previews
        publish.tsx         # Publish modal (RLS gates, credit charge)
      paywall.tsx           # Get credits: 3 packs (200/600/2000), Play Billing
      themes/[id].tsx       # 30+ palette picker (0-credit, instant preview)
      versions/[id].tsx     # Version snapshots (newest-first, restore confirm)
      code/[id].tsx         # File viewer (folder-grouped, monospace, line #s)
  ctx/session.tsx           # Supabase session context + push registration + credits
  lib/
    supabase.ts             # SSR-safe client (typeof window guard for Node pre-render)
    iap.ts                  # RevenueCat: configure, purchase, restore
    api.ts                  # Wyberai endpoints: create/chat/build/publish/versions/messages/themes
    haptics.ts              # Fire-and-forget haptic feedback (tap, success, warn)
    theme.ts                # WyberAi dark brand tokens (#0EA5E9) + 30 design palettes
    types.ts                # Project / Profile / Message / Version / Theme shapes
  components/
    Onboarding.tsx          # 3-slide first-launch carousel (AsyncStorage gate)
    ErrorBoundary.tsx       # Crash guard (isolated builder + preview)
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
