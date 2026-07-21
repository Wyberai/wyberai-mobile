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
    sign-in.tsx             # Email OTP / password (review account) / Google / GitHub / Apple
    +native-intent.ts       # Deep-link routing (push taps, OAuth callback)
    (app)/
      _layout.tsx           # Bottom tabs (Home · Projects · Activity · Account)
      home.tsx              # Home tab: hero prompt, starter/AI-suggested chips, community gallery
      index.tsx             # Projects tab: list (RLS query, pull-to-refresh, rename/delete)
      notifications.tsx     # Activity tab (auto marks read)
      account.tsx           # Credits, plan, quick links, sign out, credit activity
      new.tsx               # New-app form (web/mobile type, prompt) — hidden from tab bar
      project/[id].tsx      # Project detail: publish/unpublish, rename, convert-to-mobile, share
      build/[id].tsx        # Chat + builder (streaming edits, connectors, build theater, preview reveal)
      preview/[id].tsx      # Full-screen preview (WebView; Expo Snack for mobile projects)
      paywall.tsx           # Get credits: subscriptions + 3 one-time packs, Play Billing
      themes/[id].tsx       # 30+ palette picker (0-credit, instant preview)
      versions/[id].tsx     # Version snapshots (newest-first, restore confirm)
      code/[id].tsx         # File viewer (folder-grouped, monospace, line #s)
  ctx/session.tsx           # Supabase session context + push registration + credits
  lib/
    supabase.ts             # SSR-safe client (typeof window guard for Node pre-render)
    iap.ts                  # RevenueCat: configure, purchase, restore
    plans.ts                # Subscription tier facts — mirrors the web app's plans.ts
    api.ts                  # Wyberai endpoints: create/chat/build/publish/versions/messages/themes
    connectors.ts           # Integration catalog for the in-chat Connectors sheet
    haptics.ts              # Fire-and-forget haptic feedback (tap, success, warn)
    theme.ts                # WyberAi dark brand tokens (#0EA5E9) — mirrors the web IDE palette
    app-theme.ts / design-palettes.ts  # Theme system for END-USER generated apps (not app chrome)
    types.ts                # Project / Profile / Message / Version / Theme shapes
  components/
    Onboarding.tsx          # 3-slide first-launch carousel (AsyncStorage gate)
    BuildTheater.tsx        # Live-build visual state shown while streaming a generation
    ConnectorsSheet.tsx      # Add an integration from the phone (key-based connectors)
    PreviewRevealSheet.tsx  # Slide-up preview shown inline after a build completes
    BottomSheet.tsx         # Shared action-sheet primitive
    SafeWidget.tsx          # Error-boundary wrapper (isolates builder + preview crashes)
```

## Build a signed .aab / .apk

The release build runs entirely on **GitHub Actions** (no EAS) — see
[`docs/ANDROID_BUILD.md`](docs/ANDROID_BUILD.md) for the full setup. In short:

```bash
gh workflow run android-release.yml   # manual trigger, Actions tab or gh CLI
gh run watch                          # follow the build
gh run download <run-id>              # pulls the signed .aab and .apk
```

`eas.json` profiles still exist as a manual fallback (`eas build -p android
--profile preview|production`) but are not the primary release path.

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
