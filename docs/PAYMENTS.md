# Google Play payments — go-live checklist

The entire purchase pipeline is **already built and shipped in code**:

- App: `src/lib/iap.ts` (RevenueCat SDK) + `src/app/(app)/paywall.tsx` (purchase UI)
- Server: `wyberai` repo `src/app/api/revenuecat/webhook/route.ts` — grants credits
  idempotently (dedupe via `processed_webhooks`, atomic `adjust_credits`)
- Out-of-credits build errors deep-link to the paywall automatically

What remains is **dashboard configuration only**. Do these in order; the app needs
zero code changes to go live.

## 0. If you don't see "Monetize" at all

Two gates, in order:

1. **Merchant account.** Play Console (account level) → **Setup → Payments
   profile**. The developer account must be identity-verified AND linked to a
   Google Payments merchant account before monetization unlocks. If this page
   shows "set up a merchant account" or verification pending — finish that
   first; nothing else works until it's done.
2. **Nav level.** The section only exists *inside the app*: select the WyberAi
   app first, then in the left sidebar scroll down to **"Monetize with Play"**
   (below "Grow"). It is not on the account home page.

The app side is never the blocker: every CI `.aab` ships Google's billing
library, and `com.android.vending.BILLING` is also declared explicitly in
`app.json`. You can confirm on the internal-testing build page, which lists
the build's required permissions.

## 1. Service credentials (do first — starts the 36h validation clock)

This step enables RevenueCat to read products and purchases from Play Console.

**A. Google Cloud Console setup:**

1. Open [Google Cloud Console](https://console.cloud.google.com)
2. Select or create a Google Cloud project
3. Enable these three APIs:
   - Google Play Android Developer API
   - Google Play Developer Reporting API
   - Cloud Pub/Sub API
4. Go to **IAM & Admin → Service Accounts** → **Create Service Account**
   - Name: `revenuecat-service-account` (or any name)
   - Click **Create and continue**
5. Grant these roles:
   - **Pub/Sub Admin** (or Pub/Sub Editor if you encounter permission errors)
   - **Monitoring Viewer**
6. Click **Create and continue**, then **Done**

**B. Create and download JSON key:**

1. In **IAM & Admin → Service Accounts**, click on the service account you just created
2. Go to the **Keys** tab → **Add Key** → **Create new key**
3. Select **JSON** format and download the file
4. Save this file — you'll upload it to RevenueCat and Play Console

**⚠️ Important:** RevenueCat notes that credentials can take up to 36 hours to validate after creation. Workaround: after uploading to RevenueCat (step 3), edit and save any product description in Play Console's **Monetize with Play** section to force a sync.

## 2. Play Console — invite service account

1. Play Console → WyberAi app → **Settings** → **Users and permissions**
2. Click **Invite user** and enter the service account email (from the JSON key file, looks like `revenuecat-service-account@project-id.iam.gserviceaccount.com`)
3. Grant these account permissions:
   - View app information and download bulk reports (read-only)
   - View financial data, orders, and cancellation survey responses
   - **Manage orders and subscriptions** (critical for RevenueCat)

## 3. RevenueCat — create app configuration

1. RevenueCat dashboard → **Projects** dropdown → select your WyberAi project
2. Look for the checklist card **"Create a real app configuration"** (or go to **Apps** → **Add an app config**)
3. Select **Play Store**
4. Enter:
   - App name: `WyberAi`
   - Package name: `com.wyberai.app` (from `app.json`)
5. Upload the JSON key file you downloaded in step 1B
6. Click **Save**

**After saving, you may see a screen "Let's get WyberAi ready!" suggesting subscriptions and entitlements.** ⚠️ **IGNORE THIS.** Close the dialog or navigate away — we'll create consumable products in Play Console instead, then import them.

Note: credentials validation can take up to 36h. The workaround (edit a product description in Play Console's Monetize section) can speed this up.

## 4. Play Console — create consumable products

**Prerequisites:** Your `.aab` build must be uploaded to Play Console on any track (internal testing counts). Check: WyberAi app → **Testing → Internal testing** shows a recent build.

Once Monetize section unlocks and build is live:

1. Play Console → WyberAi app → **Monetize with Play** → **Products** → **In-app products** (NOT subscriptions)
2. Click **Create product** and create three **consumable** managed products:

| Product ID           | Name (pack) | Credits | Price (match web) |
| -------------------- | ----------- | ------- | ----------------- |
| `wyber_credits_200`  | Boost       | 200     | $19 / ₹399        |
| `wyber_credits_600`  | Power       | 600     | $49 / ₹999        |
| `wyber_credits_2000` | Studio      | 2000    | $99 / ₹1,999      |

3. For each product:
   - Set price in both USD and INR
   - Description: "One-time consumable credit pack — no subscription, no auto-renewal"
   - Click **Activate**
4. All three must be **Active** before importing to RevenueCat

## 4b. Play Console — create the subscriptions

Play Console → WyberAi app → **Monetize with Play** → **Subscriptions**. Create
**four** subscriptions; give each a **Monthly** and an **Annual** base plan. The
subscription IDs are matched in code ([lib/plan-grants.ts](../src/lib/plan-grants.ts)
server-side and [lib/plans.ts](../src/lib/plans.ts) in the app) — **use these exact IDs**:

| Subscription ID | Plan | Credits/mo | USD mo / yr | INR mo / yr | Notes |
| --------------- | ------- | ---------- | ----------- | ------------ | ----- |
| `wyber_spark`   | Spark   | 50    | $6 / $60   | ₹499 / ₹4,788   | **India-only** — set INR price only |
| `wyber_starter` | Starter | 150   | $29 / $276 | ₹1,499 / ₹14,388 | |
| `wyber_builder` | Builder | 500   | $79 / $756 | ₹3,999 / ₹38,388 | Recommended tier |
| `wyber_pro`     | Pro     | 1,500 | $199 / $1,908 | ₹9,999 / ₹95,988 | |

- Prices mirror the web ([plans.ts](../../wyberai/src/lib/plans.ts)) so mobile and web match.
  Annual = 12× the annual-rate monthly (e.g. Builder annual rate is $63/mo → $756/yr).
- Base-plan IDs: name them `monthly` and `annual` (RevenueCat reads them as
  `wyber_builder:monthly` / `wyber_builder:annual`).
- **Spark is India-only:** the app shows it only when the store currency is INR, so
  give `wyber_spark` an INR price and leave other regions unpriced/unavailable.
- Activate all base plans.

## 5. RevenueCat — import products

1. RevenueCat dashboard → **Product Catalog** → **Products**
2. Click the import icon (or **+ New** → **Import Products**)
3. Select **Google Play**
4. Import **all** — the 3 consumables (`wyber_credits_200/600/2000`) **and** the 4
   subscriptions (`wyber_spark/starter/builder/pro`, both base plans each)

## 6. RevenueCat — create offering

1. RevenueCat → **Product Catalog** → **Offerings**
2. Click **default** (or create if missing)
3. Add packages:
   - **Consumables:** add the 3 packs (identifier = product ID, e.g. `wyber_credits_200`)
   - **Subscriptions:** add each tier's **monthly** and **annual** base plan. Use the
     predefined package types **Monthly** and **Annual** so the app's billing toggle
     picks them up (the paywall keys off `PACKAGE_TYPE.MONTHLY` / `ANNUAL`).
4. Save

**Entitlements:** not required — both packs and subscription grants are applied by the
webhook (which sets the plan + credits on the profile), not by RevenueCat entitlement
gates. You may still create a `pro` entitlement if you want RevenueCat's dashboards to
track active subscribers, but the app doesn't depend on it.

## 7. RevenueCat — webhooks

1. RevenueCat → **Integrations** → **Webhooks**
2. Click **+ New webhook**
3. Set:
   - URL: `https://wyberai.com/api/revenuecat/webhook`
   - Authorization header: `Authorization: Bearer <random-secret>`
     - Generate a long random string (e.g., 32+ chars)
4. Save and copy the secret to Vercel (step 8)

## 8. Env vars

**Vercel (wyberai web, prod):**

```
REVENUECAT_WEBHOOK_SECRET=<the random secret from step 7>
REVENUECAT_TOPUP_200=wyber_credits_200
REVENUECAT_TOPUP_600=wyber_credits_600
REVENUECAT_TOPUP_2000=wyber_credits_2000
```

**GitHub Actions (wyberai-mobile):**

1. RevenueCat → **Project settings** → **API keys**
2. Copy the **public Android key** (looks like `goog_...`)
3. Add GitHub repo variable (not secret): `EXPO_PUBLIC_REVENUECAT_ANDROID_KEY` = the key you copied

## 9. CI build

1. Trigger a new CI build in wyberai-mobile (the next build will include the real RevenueCat key)
2. Wait for the build to complete and download the `.aab` artifact
3. Upload to Play Console: **Internal testing** → **Create new release** → upload `.aab`

## 10. Verify end-to-end (license tester — no real money)

1. Play Console → WyberAi app → **Settings** → **License testing**
2. Add your Google account as a tester
3. Install the internal-testing build on a real device (emulator won't work with real Play Billing)
4. Sign in and open **Account → Get credits**
5. Buy the 200 pack — balance should tick up **within ~5 seconds**
6. Check **Account → Credit activity** — purchase row should appear
7. **Idempotency check:** RevenueCat dashboard → **Webhooks** → find the purchase event → click **Re-deliver**
   - Balance must **NOT double** (webhook is idempotent)

## 11. Device test pass — comprehensive feature verification

Once the basic purchase test (step 10) passes, run this full smoke test on the device to verify all v2 features are wired up:

### Home Tab
- [ ] Hero prompt box loads and is tappable
- [ ] Starter template chips render (6 visible)
- [ ] Tap a chip creates a new project with that prompt
- [ ] "Continue building" card shows last 3 projects (if any exist)
- [ ] Community gallery loads (projects with vote counts + thumbnails)
- [ ] Tapping a gallery project opens the build screen with live preview

### Projects Tab
- [ ] List shows all projects, newest first
- [ ] Tap project → opens builder with chat + preview tabs
- [ ] Rename project via long-press
- [ ] Delete project via long-press → confirm dialog

### Account Tab
- [ ] Sign-in status displays (email + avatar)
- [ ] Credit balance shows current balance
- [ ] "Get credits" button → paywall modal
- [ ] Credit activity feed shows last 12 transactions (purchases green, spends muted)
- [ ] Each row has icon + amount + timestamp
- [ ] Activity row from step 10 purchase appears with green checkmark

### Chat + Build
- [ ] Chat persists across app restart (close app, reopen, messages still there)
- [ ] Type message → tap Build → streams response as before
- [ ] Out-of-credits deep-links to paywall (simulate by setting credits to 0 in DB)

### Versions Tab (tap toolbox icon in builder)
- [ ] Version list shows snapshots, newest first
- [ ] Tap a version → "Restore version?" confirmation
- [ ] Confirm restore → file tree updates to old version
- [ ] Chat still works with restored version

### Code Viewer (tap code icon in builder)
- [ ] File tree shows all files, grouped by folder
- [ ] Tap file → monospace viewer opens with line numbers
- [ ] Scroll works without crashing

### Themes (tap palette icon in builder)
- [ ] Theme grid loads 30+ palettes (or as many exist)
- [ ] Tap a palette → live preview + preview file updates
- [ ] Tap again to apply → theme saved
- [ ] Refresh preview → theme persists
- [ ] No credits charged (0-credit feature)

### Paywall — subscriptions
- [ ] "Subscribe & save" section shows above the packs
- [ ] Monthly/Annual toggle switches the prices (annual shows a per-month equivalent)
- [ ] 4 tiers on an INR device (Spark/Starter/Builder/Pro); **Spark hidden** on a USD device
- [ ] Builder card is highlighted (RECOMMENDED)
- [ ] Prices are localized (₹ on an India account, $ on a US account) — never web prices
- [ ] Credits/mo per tier match web (50 / 150 / 500 / 1,500)
- [ ] Subscribe → Play sheet → on success, balance increases by the tier's credits
- [ ] Profile plan updates (check via web dashboard or Account)

### Paywall — one-time packs
- [ ] "Prefer a one-time top-up?" section shows the 3 packs, big-first
- [ ] Packs have badges (BEST VALUE, MOST POPULAR)
- [ ] Prices show in local currency (USD or INR)
- [ ] "What credits buy" card lists build/edit costs
- [ ] Play Billing trust row visible
- [ ] Buy 200 pack → purchase completes within 5s
- [ ] Balance updates immediately; close paywall → new balance everywhere
- [ ] Idempotency: re-deliver the webhook event → balance does NOT double

### Onboarding (first-run only)
- [ ] First app launch shows 3-slide carousel
- [ ] Slide 1: "Ship apps with AI" + WyberAi wordmark
- [ ] Slide 2: "Preview in real time" + screenshot
- [ ] Slide 3: "Same prompt, web & mobile" + platform parity claim
- [ ] Skip button always visible
- [ ] Swipe to next slide works
- [ ] Slide 3 "Get started" → closes carousel, goes to Home

### Edge Cases
- [ ] App survives background/foreground cycle (auth session doesn't reset)
- [ ] No console errors in dev tools
- [ ] Network error in chat → error message shown, retry works
- [ ] Offline (toggle airplane mode) → graceful error, not frozen
- [ ] Low credits (e.g., 10 left) → still able to build if below cost

## Notes

- **Two purchase types:** consumable credit packs (one-time, never expire) **and**
  subscription tiers (recurring monthly credits, mirror the web plans). Both grant via
  the same RevenueCat webhook, which now mirrors the Dodo grant model exactly
  ([plan-grants.ts](../../wyberai/src/lib/plan-grants.ts)): credits are **added** (never
  set, so packs survive a subscribe), and a lapse drops to free but keeps the balance.
- **Pricing parity:** the app never shows web prices — it renders the store's localized
  `priceString`, so India sees ₹, US sees $. Set the store prices to match the web
  tiers (table in §4b) so there's no cross-rail price gap.
- **Spark is India-only** — the paywall shows it only when the store currency is INR.
- iOS later: create the same products (packs + subscriptions) in App Store Connect, set
  `EXPO_PUBLIC_REVENUECAT_IOS_KEY`; the webhook, plans, and paywall are all shared.
