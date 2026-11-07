// Ported from the web repo's src/lib/seo-beast-checklist.ts and the Marketing Beast
// sets in components/editor/SeoScanPanel.tsx. The scan itself runs server-side
// (POST /api/seo/scan); only the checklist, fix prompts and bundles live here.

// Single source of truth for the "SEO & Marketing Beast" scan's id/label/order
// — the actual checks are computed in src/app/api/seo/scan/route.ts (which
// reads the project's real index.html/public files, same as before), this
// just lets the UI show the full "here's what we'll check" list up front,
// before the scan runs, without duplicating the label strings.
export const SEO_BEAST_CHECKLIST: { id: string; label: string }[] = [
  { id: 'title', label: 'Page title is set' },
  { id: 'description', label: 'Meta description is set' },
  { id: 'opengraph', label: 'Social preview tags (Open Graph)' },
  { id: 'twitter-card', label: 'Twitter Card meta tags' },
  { id: 'structured-data', label: 'Structured data (JSON-LD)' },
  { id: 'canonical', label: 'Canonical URL tag' },
  { id: 'viewport', label: 'Mobile viewport meta tag' },
  { id: 'favicon', label: 'Favicon present' },
  { id: 'alt-text', label: 'Images have alt text' },
  { id: 'lang-attr', label: 'HTML lang attribute set' },
  { id: 'heading', label: 'Page has a proper H1 heading' },
  { id: 'lazy-loading', label: 'Images use lazy loading' },
  { id: 'analytics', label: 'Analytics tracking installed' },
  { id: 'cookie-consent', label: 'Cookie consent banner' },
  { id: 'custom-404', label: 'Custom 404 page' },
  { id: 'robots', label: 'robots.txt present' },
  { id: 'sitemap', label: 'sitemap.xml present' },
  { id: 'llms-txt', label: 'AI assistants can read your site (llms.txt)' },
]

// Only for the checks the scan does NOT already fix mechanically (see
// src/lib/seo-beast-fix.ts) — the ones that need real written copy or
// judgment. Used both by each check's individual "Fix with AI" button and by
// "Apply all fixes" to bundle whatever's left into one prompt.
export const SEO_FIX_PROMPTS: Record<string, string> = {
  title: 'Set a descriptive, keyword-rich <title> tag in index.html for this app.',
  description: 'Add a compelling <meta name="description"> (under 160 characters) to index.html.',
  opengraph: 'Add complete Open Graph meta tags (og:title, og:description, og:image, og:url) to index.html so shared links show a rich preview.',
  'twitter-card': 'Add a twitter:card meta tag (and twitter:title/twitter:description/twitter:image) to index.html so links render richly on X/Twitter.',
  'structured-data': 'Add appropriate schema.org JSON-LD structured data to index.html for this type of site.',
  favicon: "Generate and add a favicon matching this app's branding, and link it in index.html.",
  heading: 'Add a clear <h1> heading to the main page describing what this app/site does.',
  'custom-404': 'Add a custom 404/not-found page styled to match the rest of the app, with a link back home.',
}

// "Make it a Marketing Beast" — a curated bundle of the launch-readiness
// content every real project needs, distinct from the checks above (those
// are diagnostics for what the app ALREADY has; this is a one-shot generator
// for what it's usually missing). Deliberately only real generateable
// content — each item is a file/page/snippet the model can actually write —
// not audit-style tasks like "test forms" or "check broken links" that need
// running tests, not writing content, so they'd overpromise if bundled here.
// No new pricing logic needed: this dispatches through the same
// wyber:chat-prompt → normal edit path every other panel uses, and a
// generation this size naturally settles into the large/xl edit tier
// (credits.ts) from its real output tokens — same mechanism, not a special case.
//
// A crawlable marketing site's launch checklist (privacy/terms/robots.txt/
// sitemap.xml) doesn't transfer 1:1 to a mobile app (app stores don't care
// about robots.txt, but DO require a privacy policy and real app icons) or a
// SaaS product (needs a pricing page and conversion trust signals more than
// it needs a cookie banner) or a generic tool (mostly behind auth, so
// onboarding/empty-states matter more than per-page SEO) — so each project
// type gets its own curated 10, not one list stretched to fit everything.
export type MarketingBeastType = 'website' | 'saas' | 'mobile' | 'app';

export const MARKETING_BEAST_SETS: Record<MarketingBeastType, { items: { label: string; detail: string }[]; prompt: string }> = {
  website: {
    items: [
      { label: 'Privacy Policy', detail: 'A real, complete page — not a placeholder' },
      { label: 'Terms of Service', detail: 'A real, complete page' },
      { label: 'Custom 404 page', detail: 'Branded, matches the site\'s design, links back home' },
      { label: 'Per-page SEO meta tags', detail: 'Descriptive title + meta description on every real page' },
      { label: 'Social share previews', detail: 'Open Graph + Twitter Card tags — rich link previews' },
      { label: 'Favicon + app icons', detail: 'Matches the site\'s existing branding' },
      { label: 'robots.txt', detail: 'Allows crawlers, points to the sitemap' },
      { label: 'sitemap.xml', detail: 'Lists every real route on the site' },
      { label: 'Cookie consent banner', detail: 'Dismissible, accept/decline' },
      { label: 'Analytics scaffold', detail: 'GA4-ready tracking helper, wired into route changes' },
    ],
    prompt: `Make this site launch-ready by adding all of the following. Match the site's existing design system, tone, and branding throughout — none of this should look bolted-on:

1. Privacy Policy page — a real, complete policy referencing what this specific site actually does, not generic boilerplate.
2. Terms of Service page — a real, complete page, same standard as the Privacy Policy.
3. A custom 404 "page not found" page, styled to match the rest of the site, with a clear link back home.
4. Descriptive, keyword-relevant <title> and <meta name="description"> tags for every real page/route.
5. Open Graph and Twitter Card meta tags (og:title, og:description, og:image, og:url, twitter:card) so shared links show a rich preview.
6. A favicon and app icons matching the site's existing branding/colors.
7. public/robots.txt allowing all crawlers and pointing to the sitemap.
8. public/sitemap.xml listing every real route this site has.
9. A dismissible cookie-consent banner (accept/decline) using the site's existing UI style.
10. A lightweight analytics scaffold — tracks page views on route change, reads a measurement ID from an env var, with a clear placeholder for when no ID is set yet (do not fabricate a working GA account).

Only add these — do not modify any existing feature, page, or styling beyond what's needed to wire these in.`,
  },
  saas: {
    items: [
      { label: 'Public landing page', detail: 'Hero, features, CTA — in front of the app, not the login screen' },
      { label: 'Pricing page', detail: 'Clear plan tiers, matching what the app actually offers' },
      { label: 'Privacy Policy', detail: 'A real, complete page' },
      { label: 'Terms of Service', detail: 'A real, complete page' },
      { label: 'Custom 404 page', detail: 'Branded, links back home' },
      { label: 'Refund / cancellation policy', detail: 'A real page — required trust signal for paid products' },
      { label: 'Empty states + onboarding checklist', detail: 'No blank screens for a brand-new signup' },
      { label: 'Social share previews', detail: 'Open Graph + Twitter Card tags' },
      { label: 'Favicon + app icons', detail: 'Matches the product\'s existing branding' },
      { label: 'Analytics scaffold', detail: 'GA4-ready tracking helper, wired into route changes' },
    ],
    prompt: `Make this SaaS product launch-ready by adding all of the following. Match the app's existing design system, tone, and branding throughout — none of this should look bolted-on:

1. A public marketing landing page (hero, real feature list, clear CTA) in front of the app — shown to logged-out visitors instead of jumping straight to a login screen.
2. A pricing page with clear plan tiers matching what this product actually offers (or a reasonable free/pro structure if none exists yet).
3. Privacy Policy page — a real, complete policy referencing what this specific product actually does.
4. Terms of Service page — a real, complete page, same standard as the Privacy Policy.
5. A custom 404 "page not found" page, styled to match the rest of the app, with a clear link back home.
6. A refund/cancellation policy page — a real trust signal for any product charging money.
7. Proper empty states for every major dashboard screen, plus a short onboarding checklist for a brand-new signup so nothing looks blank/broken on first login.
8. Open Graph and Twitter Card meta tags (og:title, og:description, og:image, og:url, twitter:card) for the public landing/pricing pages.
9. A favicon and app icons matching the product's existing branding/colors.
10. A lightweight analytics scaffold — tracks page views on route change, reads a measurement ID from an env var, with a clear placeholder for when no ID is set yet.

Only add these — do not modify any existing feature, page, or styling beyond what's needed to wire these in.`,
  },
  mobile: {
    items: [
      { label: 'Privacy Policy', detail: 'Required for App Store / Play Store submission' },
      { label: 'Terms of Service', detail: 'A real, complete page/screen' },
      { label: 'Full app icon set', detail: 'All required iOS/Android sizes, matching the app\'s branding' },
      { label: 'Splash screen', detail: 'Matches the app\'s branding' },
      { label: 'Onboarding walkthrough', detail: 'First-run screens introducing the app' },
      { label: 'Empty states', detail: 'For every major screen — no blank/broken-looking views' },
      { label: 'Permission explainer screens', detail: 'Why camera/location/notifications are needed, shown before the OS prompt' },
      { label: 'Push notification opt-in', detail: 'A dedicated screen/prompt, not a bare OS dialog' },
      { label: 'Store listing copy', detail: 'Title, subtitle, description, keywords — ready to paste into App Store Connect / Play Console' },
      { label: 'Analytics scaffold', detail: 'Screen-view tracking helper wired into navigation' },
    ],
    prompt: `Make this mobile app store-ready by adding all of the following. Match the app's existing design system and branding throughout:

1. A Privacy Policy screen/page — a real, complete policy referencing what this specific app actually does. This is REQUIRED for App Store/Play Store submission.
2. A Terms of Service screen/page — a real, complete page, same standard as the Privacy Policy.
3. A full app icon set at every size iOS and Android require, matching the app's existing branding/colors.
4. A splash screen matching the app's branding.
5. A short first-run onboarding walkthrough (2-4 screens) introducing what the app does.
6. Proper empty states for every major screen — nothing should look blank or broken before real data exists.
7. Permission-explainer screens shown BEFORE the native OS permission dialog for anything the app requests (camera, location, notifications, etc.) — explain why in the app's own voice, not the generic OS prompt.
8. A push-notification opt-in screen if the app uses notifications, instead of firing the bare OS prompt unexplained.
9. App Store / Play Store listing copy as a single reference doc: app title, subtitle/short description, full description, and a keyword list — ready to paste into App Store Connect / Play Console.
10. A lightweight analytics scaffold that tracks screen views on navigation, reading a measurement ID from an env var, with a clear placeholder for when no ID is set yet.

Only add these — do not modify any existing feature or screen beyond what's needed to wire these in.`,
  },
  app: {
    items: [
      { label: 'Privacy Policy', detail: 'A real, complete page' },
      { label: 'Terms of Service', detail: 'A real, complete page' },
      { label: 'Custom 404 / error page', detail: 'Branded, links back home' },
      { label: 'Empty states', detail: 'For every major screen — no blank "nothing here" moments' },
      { label: 'Onboarding walkthrough', detail: 'A short first-run intro for new users' },
      { label: 'Keyboard shortcuts help', detail: 'A quick-reference panel, if the app is shortcut-heavy' },
      { label: 'Favicon + app icons', detail: 'Matches the app\'s existing branding' },
      { label: 'Social share previews', detail: 'Open Graph + Twitter Card tags for the public entry page' },
      { label: 'robots.txt + sitemap.xml', detail: 'Minimal but present, for whatever\'s publicly reachable' },
      { label: 'Analytics scaffold', detail: 'GA4-ready tracking helper, wired into route changes' },
    ],
    prompt: `Make this app launch-ready by adding all of the following. Match the app's existing design system, tone, and branding throughout — none of this should look bolted-on:

1. Privacy Policy page — a real, complete policy referencing what this specific app actually does, not generic boilerplate.
2. Terms of Service page — a real, complete page, same standard as the Privacy Policy.
3. A custom 404/error page, styled to match the rest of the app, with a clear link back home.
4. Proper empty states for every major screen — nothing should look blank or broken before real data exists.
5. A short first-run onboarding walkthrough introducing what the app does.
6. A keyboard-shortcuts help panel/modal if this app has meaningful keyboard interactions — skip this one if it doesn't.
7. A favicon and app icons matching the app's existing branding/colors.
8. Open Graph and Twitter Card meta tags (og:title, og:description, og:image, og:url, twitter:card) for whatever public entry page this app has.
9. A minimal public/robots.txt and public/sitemap.xml covering whatever pages are actually publicly reachable (skip if the entire app is behind auth with nothing public to list).
10. A lightweight analytics scaffold — tracks page views on route change, reads a measurement ID from an env var, with a clear placeholder for when no ID is set yet.

Only add these — do not modify any existing feature, page, or styling beyond what's needed to wire these in.`,
  },
};

export function resolveMarketingBeastType(projectType?: string): MarketingBeastType {
  if (projectType === 'website' || projectType === 'saas' || projectType === 'mobile') return projectType;
  return 'app';
}

