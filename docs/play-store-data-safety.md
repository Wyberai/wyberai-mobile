# Play Store Data Safety Form — WyberAi

Reference for filling out Google Play Console's Data Safety section. Not a code change — update this doc when data collection actually changes, and re-check the live form against it before each submission.

## Data collected

| Category | Data | Purpose | Shared with third parties? | Encrypted in transit | User can request deletion |
|---|---|---|---|---|---|
| Account info | Email address | Sign-in, account identification | No | Yes | Yes — Account → Delete Account |
| Financial info | Purchase history | Credit top-ups, subscriptions | No (processed by Google Play Billing / RevenueCat as payment processors, not shared for their own use) | Yes | Yes |
| App activity | Apps built, projects created, AI generations, credit usage | Core product function, usage-based billing | No | Yes | Yes |
| App activity | Preview session records (project_id + viewer_id + date) | Per-viewer/day credit gating for shared previews (see `preview_sessions` table) | No | Yes | Tied to account deletion |
| Device / other IDs | Push notification token (FCM/APNs) | Build-complete, publish, credit-alert, and other notifications | No | Yes | Yes — token is cleared on sign-out / account deletion |
| App info and performance | Crash logs and diagnostics (Sentry) | Stability monitoring | No (Sentry is our error-tracking vendor, not a data buyer) | Yes | N/A — crash reports aren't linked to identity beyond a user id in context |

## Not collected

- Location (precise or approximate)
- Contacts
- Photos/videos beyond what the user explicitly attaches to a build prompt (never scanned, never used for anything but that one generation request)
- Biometric data (Face ID / fingerprint unlock, if enabled, never leaves the device — it's a local OS-level gate, not transmitted)
- Health, fitness, or messages

## Data linked to identity

Account info, app activity, and purchase history are linked to the user's account. Crash diagnostics and push tokens are associated with a user id but not with any of the above for cross-referencing beyond normal product operation.

## Security practices to confirm still true before submitting

- Data is encrypted in transit (HTTPS/TLS everywhere — Supabase, Vercel, Expo Updates all TLS-only).
- Users can request account and data deletion in-app (Account screen → Delete Account) and via `https://wyberai.com/delete-account`.
- Sessions are stored in the OS keychain/keystore via chunked `expo-secure-store` (see `src/lib/secure-storage.ts`), not plaintext `AsyncStorage`.

## Links to keep in sync with the Play Console form

- Privacy policy: `https://wyberai.com/privacy` (also in-app: Account → Privacy Policy)
- Terms: `https://wyberai.com/terms`
- Delete account: `https://wyberai.com/delete-account`
