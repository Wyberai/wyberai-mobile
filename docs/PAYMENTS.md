# Google Play payments — go-live checklist

The entire purchase pipeline is **already built and shipped in code**:

- App: `src/lib/iap.ts` (RevenueCat SDK) + `src/app/(app)/paywall.tsx` (purchase UI)
- Server: `wyberai` repo `src/app/api/revenuecat/webhook/route.ts` — grants credits
  idempotently (dedupe via `processed_webhooks`, atomic `adjust_credits`)
- Out-of-credits build errors deep-link to the paywall automatically

What remains is **dashboard configuration only**. Do these in order; the app needs
zero code changes to go live.

## 1. Play Console — create the products

Play Console → WyberAi app → Monetize → Products → **In-app products** (NOT
subscriptions). Create three **consumable** managed products:

| Product ID           | Name                | Suggested price |
| -------------------- | ------------------- | --------------- |
| `wyber_credits_200`  | 200 credits         | ₹499 / $9       |
| `wyber_credits_600`  | 600 credits         | ₹1,299 / $19    |
| `wyber_credits_2000` | 2000 credits        | ₹3,499 / $49    |

The paywall matches packs by the number in the id (`/200/`, `/600/`, `/2000/`),
so any id containing those numbers works — the ones above are canonical.
Activate all three.

## 2. RevenueCat — connect Play + define the offering

1. RevenueCat dashboard → create Android app (package `com.wyberai.app` — check
   `app.json` for the exact applicationId) and upload the Play service-account
   JSON (Play Console → API access).
2. Products → import the three Play products.
3. Offerings → `default` offering → add all three products as packages
   (identifiers can mirror the product ids). The app shows whatever the current
   offering contains.
4. Copy the **public Android SDK key** (goog_…).

## 3. Env vars

**App build** (GitHub Actions secret / `.env` used at build time):

```
EXPO_PUBLIC_REVENUECAT_ANDROID_KEY=goog_xxx
```

**Vercel (wyberai web, prod)** — the webhook needs the product-id → credits map:

```
REVENUECAT_WEBHOOK_SECRET=<any long random string>
REVENUECAT_TOPUP_200=wyber_credits_200
REVENUECAT_TOPUP_600=wyber_credits_600
REVENUECAT_TOPUP_2000=wyber_credits_2000
```

## 4. RevenueCat webhook

RevenueCat → Integrations → Webhooks:

- URL: `https://wyberai.com/api/revenuecat/webhook`
- Authorization header value: the exact `REVENUECAT_WEBHOOK_SECRET` you set above.

## 5. Verify end-to-end (license tester — no real money)

1. Play Console → Settings → License testing → add your Google account.
2. Install an internal-testing build, sign in, open **Get credits**.
3. Buy the 200 pack with the test card — balance should tick up within ~5s.
4. Check the purchase row appears under Account → Credit activity.
5. Re-deliver the same webhook event from the RevenueCat dashboard → balance
   must NOT double (idempotency).

## Notes

- Packs are one-time consumables — the fine print in the paywall already says
  "no subscription, no auto-renewal" (Play policy-clean).
- The webhook also supports subscription products (`REVENUECAT_PRODUCT_PRO_*`)
  if a Pro plan is ever sold in-app; unused today.
- iOS later: create the same products in App Store Connect, set
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY`, everything else is shared.
