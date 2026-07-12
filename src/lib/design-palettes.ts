// Curated, hand-tuned design palettes injected into every fresh web build.
//
// Lovable lets the model improvise hex colors — which often drifts generic or
// low-contrast. We instead inject a complete, accessible, domain-matched HSL
// token set (the shadcn token names from design-system.ts) as a concrete DESIGN
// BRIEF. The model gets a beautiful starting palette for free and only has to
// build; freshness comes from picking a different palette per build. Every value
// here is tuned for contrast (foreground legible on its surface, primary-
// foreground legible on primary).

export interface Palette {
  id: string
  label: string // short human name for UI (theme cards, plan-mode direction picker)
  vibe: string // one-line brief shown to the model
  mode: 'light' | 'dark'
  fontSans: string // from the curated font menu (see design-system.ts)
  fontDisplay: string
  radius: string
  tokens: Record<string, string> // shadcn token name → HSL channels ("245 70% 55%")
  gradientHero: string
  domains: string[] // keywords used to match the user's prompt
}

// Shared neutral scaffolds — each palette overrides the brand bits (primary,
// ring, accents, surface tint). Keeps contrast consistent across the set.
const darkBase = (over: Record<string, string>): Record<string, string> => ({
  background: '240 10% 5%', foreground: '0 0% 98%',
  card: '240 10% 7%', 'card-foreground': '0 0% 98%',
  popover: '240 10% 7%', 'popover-foreground': '0 0% 98%',
  secondary: '240 6% 14%', 'secondary-foreground': '0 0% 98%',
  muted: '240 6% 14%', 'muted-foreground': '240 5% 65%',
  accent: '240 6% 16%', 'accent-foreground': '0 0% 98%',
  destructive: '0 72% 51%', 'destructive-foreground': '0 0% 98%',
  border: '240 6% 16%', input: '240 6% 16%', ring: '0 0% 83%',
  ...over,
})

const lightBase = (over: Record<string, string>): Record<string, string> => ({
  background: '0 0% 100%', foreground: '240 10% 10%',
  card: '0 0% 100%', 'card-foreground': '240 10% 10%',
  popover: '0 0% 100%', 'popover-foreground': '240 10% 10%',
  secondary: '240 5% 96%', 'secondary-foreground': '240 6% 10%',
  muted: '240 5% 96%', 'muted-foreground': '240 4% 46%',
  accent: '240 5% 96%', 'accent-foreground': '240 6% 10%',
  destructive: '0 84% 60%', 'destructive-foreground': '0 0% 98%',
  border: '240 6% 90%', input: '240 6% 90%', ring: '240 10% 10%',
  ...over,
})

export const PALETTES: Palette[] = [
  // ── Finance / fintech / crypto ──
  {
    id: 'fintech-emerald-dark', label: 'Emerald Ledger', vibe: 'Premium fintech — deep slate canvas, confident emerald primary, calm and precise', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.625rem',
    tokens: darkBase({ background: '222 30% 6%', card: '222 28% 8%', popover: '222 28% 8%', border: '222 20% 15%', input: '222 20% 15%', primary: '152 64% 46%', 'primary-foreground': '152 80% 7%', ring: '152 64% 46%' }),
    gradientHero: 'radial-gradient(120% 120% at 80% 0%, hsl(152 64% 46% / 0.18), transparent 60%)',
    domains: ['finance', 'fintech', 'bank', 'crypto', 'invest', 'wallet', 'payment', 'trading', 'budget', 'accounting'],
  },
  {
    id: 'fintech-blue-light', label: 'Cobalt Clean', vibe: 'Trustworthy fintech — clean white, decisive cobalt blue, data-forward', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.625rem',
    tokens: lightBase({ primary: '221 83% 53%', 'primary-foreground': '0 0% 100%', ring: '221 83% 53%', secondary: '221 40% 96%', accent: '221 40% 96%', 'accent-foreground': '221 50% 25%' }),
    gradientHero: 'linear-gradient(135deg, hsl(221 83% 53% / 0.10), hsl(199 89% 60% / 0.10))',
    domains: ['finance', 'fintech', 'bank', 'invoice', 'payroll', 'saas', 'b2b', 'enterprise'],
  },
  // ── Wellness / health / fitness ──
  {
    id: 'wellness-sage-light', label: 'Sage & Cream', vibe: 'Calm wellness — warm cream base, sage-teal primary, airy and human', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '1rem',
    tokens: lightBase({ background: '80 33% 98%', foreground: '150 14% 14%', card: '80 33% 99%', muted: '120 16% 94%', 'muted-foreground': '150 8% 40%', secondary: '120 16% 94%', accent: '28 80% 92%', 'accent-foreground': '20 50% 30%', border: '120 14% 88%', input: '120 14% 88%', primary: '160 45% 38%', 'primary-foreground': '0 0% 100%', ring: '160 45% 38%' }),
    gradientHero: 'linear-gradient(160deg, hsl(160 45% 38% / 0.12), hsl(28 80% 60% / 0.10))',
    domains: ['wellness', 'health', 'fitness', 'yoga', 'meditation', 'therapy', 'medical', 'care', 'nutrition', 'spa', 'mental'],
  },
  {
    id: 'wellness-teal-dark', label: 'Deep Aqua', vibe: 'Modern health — deep teal canvas, luminous aqua primary, focused', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.875rem',
    tokens: darkBase({ background: '195 40% 6%', card: '195 35% 8%', popover: '195 35% 8%', border: '195 25% 15%', input: '195 25% 15%', primary: '172 70% 46%', 'primary-foreground': '195 60% 8%', ring: '172 70% 46%' }),
    gradientHero: 'radial-gradient(120% 100% at 50% 0%, hsl(172 70% 46% / 0.18), transparent 65%)',
    domains: ['wellness', 'health', 'fitness', 'workout', 'sleep', 'habit', 'tracker', 'medical'],
  },
  // ── Creative / design / portfolio ──
  {
    id: 'creative-violet-dark', label: 'Electric Violet', vibe: 'Bold creative — near-black violet canvas, electric violet→pink, expressive', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '1rem',
    tokens: darkBase({ background: '255 30% 6%', card: '255 28% 8%', popover: '255 28% 8%', border: '255 20% 16%', input: '255 20% 16%', primary: '270 80% 65%', 'primary-foreground': '0 0% 100%', accent: '320 40% 18%', 'accent-foreground': '320 80% 88%', ring: '270 80% 65%' }),
    gradientHero: 'linear-gradient(135deg, hsl(270 80% 65% / 0.25), hsl(330 80% 60% / 0.22))',
    domains: ['creative', 'design', 'portfolio', 'art', 'agency', 'studio', 'music', 'photo', 'nft', 'gallery'],
  },
  {
    id: 'creative-coral-light', label: 'Coral Editorial', vibe: 'Editorial-creative — warm paper base, rose-coral primary, sharp contemporary serif headings (italic for emphasis)', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Instrument Serif', radius: '0.75rem',
    tokens: lightBase({ background: '30 40% 99%', foreground: '255 18% 12%', muted: '20 30% 95%', 'muted-foreground': '255 8% 42%', secondary: '20 30% 95%', accent: '350 70% 95%', 'accent-foreground': '350 60% 35%', border: '20 24% 90%', input: '20 24% 90%', primary: '350 78% 58%', 'primary-foreground': '0 0% 100%', ring: '350 78% 58%' }),
    gradientHero: 'linear-gradient(135deg, hsl(350 78% 58% / 0.12), hsl(28 85% 62% / 0.12))',
    domains: ['creative', 'portfolio', 'blog', 'magazine', 'fashion', 'beauty', 'wedding', 'event', 'brand'],
  },
  // ── SaaS / tech / dashboard / tool ──
  {
    id: 'saas-indigo-dark', label: 'Graphite Indigo', vibe: 'Linear-precise SaaS — graphite canvas, indigo primary, crisp and technical', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.625rem',
    tokens: darkBase({ background: '240 10% 5%', primary: '243 75% 62%', 'primary-foreground': '0 0% 100%', ring: '243 75% 62%' }),
    gradientHero: 'radial-gradient(120% 120% at 100% 0%, hsl(243 75% 62% / 0.20), transparent 60%)',
    domains: ['saas', 'dashboard', 'admin', 'tool', 'analytics', 'crm', 'tech', 'developer', 'api', 'platform', 'internal'],
  },
  {
    id: 'saas-indigo-light', label: 'Indigo Air', vibe: 'Clean SaaS — bright white, indigo primary, strong hierarchy, lots of air', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.625rem',
    tokens: lightBase({ primary: '243 75% 59%', 'primary-foreground': '0 0% 100%', ring: '243 75% 59%', secondary: '243 30% 96%', accent: '243 30% 96%', 'accent-foreground': '243 50% 30%' }),
    gradientHero: 'linear-gradient(135deg, hsl(243 75% 59% / 0.10), hsl(270 70% 62% / 0.10))',
    domains: ['saas', 'dashboard', 'tool', 'startup', 'landing', 'product', 'app'],
  },
  // ── Luxury / premium / real estate ──
  {
    id: 'luxury-gold-dark', label: 'Champagne Noir', vibe: 'Luxury minimal — true-black, champagne-gold accent, generous negative space, elegant', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'Playfair Display', radius: '0.5rem',
    tokens: darkBase({ background: '40 10% 5%', foreground: '40 20% 94%', card: '40 8% 7%', popover: '40 8% 7%', muted: '40 6% 13%', 'muted-foreground': '40 10% 62%', secondary: '40 6% 13%', accent: '40 30% 14%', 'accent-foreground': '40 60% 80%', border: '40 8% 15%', input: '40 8% 15%', primary: '40 68% 56%', 'primary-foreground': '40 40% 8%', ring: '40 68% 56%' }),
    gradientHero: 'linear-gradient(135deg, hsl(40 68% 56% / 0.16), transparent 60%)',
    domains: ['luxury', 'premium', 'real estate', 'realestate', 'property', 'jewelry', 'hotel', 'concierge', 'private', 'exclusive'],
  },
  // ── Editorial / blog / education ──
  {
    id: 'editorial-ink-light', label: 'Ink & Paper', vibe: 'Editorial — warm off-white, near-black ink, terracotta accent, warm characterful serif display, reading-first', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Fraunces', radius: '0.375rem',
    tokens: lightBase({ background: '40 33% 98%', foreground: '20 14% 12%', card: '40 33% 99%', muted: '40 20% 94%', 'muted-foreground': '20 8% 40%', secondary: '40 20% 94%', accent: '20 60% 94%', 'accent-foreground': '20 60% 32%', border: '40 16% 88%', input: '40 16% 88%', primary: '18 72% 48%', 'primary-foreground': '0 0% 100%', ring: '18 72% 48%' }),
    gradientHero: 'linear-gradient(135deg, hsl(18 72% 48% / 0.10), hsl(40 60% 60% / 0.10))',
    domains: ['blog', 'magazine', 'news', 'education', 'course', 'school', 'book', 'writer', 'newsletter', 'docs', 'content'],
  },
  // ── Food / restaurant / ecommerce ──
  {
    id: 'food-amber-light', label: 'Amber Warmth', vibe: 'Appetizing food — warm white, amber-orange primary, friendly rounded, mouthwatering', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '1rem',
    tokens: lightBase({ background: '36 50% 99%', foreground: '20 14% 14%', muted: '30 35% 95%', 'muted-foreground': '20 8% 42%', secondary: '30 35% 95%', accent: '25 90% 94%', 'accent-foreground': '20 80% 36%', border: '30 24% 90%', input: '30 24% 90%', primary: '25 90% 53%', 'primary-foreground': '0 0% 100%', ring: '25 90% 53%' }),
    gradientHero: 'linear-gradient(135deg, hsl(25 90% 53% / 0.14), hsl(45 95% 58% / 0.14))',
    domains: ['food', 'restaurant', 'cafe', 'menu', 'recipe', 'delivery', 'ecommerce', 'shop', 'store', 'retail', 'coffee'],
  },
  // ── Playful / social / community ──
  {
    id: 'playful-citrus-light', label: 'Citrus Pop', vibe: 'Playful & social — sunlit warm base, saturated tangerine primary, lime accents, rounded and cheerful (never purple-gradient slop)', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '1.25rem',
    tokens: lightBase({ background: '40 60% 98%', foreground: '24 20% 12%', muted: '40 40% 93%', 'muted-foreground': '24 10% 42%', secondary: '40 40% 93%', accent: '95 60% 90%', 'accent-foreground': '100 45% 24%', border: '40 30% 88%', input: '40 30% 88%', primary: '28 95% 52%', 'primary-foreground': '20 90% 10%', ring: '28 95% 52%' }),
    gradientHero: 'linear-gradient(135deg, hsl(28 95% 52% / 0.16), hsl(95 70% 50% / 0.12))',
    domains: ['social', 'community', 'kids', 'game', 'fun', 'event', 'dating', 'chat', 'forum', 'club'],
  },
  // ── 2026 frontier: editorial ink-on-paper ──
  {
    id: 'paper-oxblood-light', label: 'Oxblood Archive', vibe: 'Archival editorial — aged warm paper, oxblood-burgundy primary, characterful serif, quiet authority', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Fraunces', radius: '0.25rem',
    tokens: lightBase({ background: '38 30% 96%', foreground: '20 20% 10%', card: '38 30% 98%', popover: '38 30% 98%', muted: '38 20% 91%', 'muted-foreground': '25 10% 38%', secondary: '38 20% 91%', accent: '10 40% 90%', 'accent-foreground': '355 45% 28%', border: '38 16% 84%', input: '38 16% 84%', primary: '355 65% 34%', 'primary-foreground': '30 40% 97%', ring: '355 65% 34%' }),
    gradientHero: 'linear-gradient(160deg, hsl(355 65% 34% / 0.08), hsl(38 60% 60% / 0.10))',
    domains: ['journal', 'publication', 'essay', 'magazine', 'editorial', 'history', 'museum', 'archive', 'research', 'author', 'literature'],
  },
  {
    id: 'midnight-press-dark', label: 'Midnight Press', vibe: 'Dark editorial — warm near-black newsroom, amber primary, sharp serif display with italic emphasis', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'Instrument Serif', radius: '0.375rem',
    tokens: darkBase({ background: '30 10% 5%', foreground: '35 25% 94%', card: '30 8% 7%', popover: '30 8% 7%', muted: '30 8% 12%', 'muted-foreground': '30 8% 60%', secondary: '30 8% 12%', accent: '30 12% 13%', 'accent-foreground': '36 60% 80%', border: '30 8% 15%', input: '30 8% 15%', primary: '36 80% 60%', 'primary-foreground': '30 60% 8%', ring: '36 80% 60%' }),
    gradientHero: 'radial-gradient(110% 100% at 50% 0%, hsl(36 80% 60% / 0.12), transparent 60%)',
    domains: ['magazine', 'media', 'film', 'journalism', 'podcast', 'newsletter', 'publishing', 'culture', 'cinema'],
  },
  // ── 2026 frontier: near-black engineered precision (one saturated accent) ──
  {
    id: 'precision-sky-dark', label: 'Sky Precision', vibe: 'Engineered precision — near-black canvas, single sky-blue accent, 1px hairline borders, mono microlabels, calm technical', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.375rem',
    tokens: darkBase({ background: '220 25% 4%', foreground: '210 20% 96%', card: '220 22% 6%', popover: '220 22% 6%', secondary: '220 15% 10%', muted: '220 15% 10%', 'muted-foreground': '218 10% 60%', accent: '218 18% 12%', 'accent-foreground': '199 80% 80%', border: '218 15% 14%', input: '218 15% 14%', primary: '199 89% 48%', 'primary-foreground': '210 100% 6%', ring: '199 89% 48%' }),
    gradientHero: 'radial-gradient(120% 110% at 70% 0%, hsl(199 89% 48% / 0.16), transparent 60%)',
    domains: ['developer', 'devtool', 'api', 'infrastructure', 'cloud', 'engineering', 'code', 'terminal', 'data', 'observability'],
  },
  {
    id: 'precision-ember-dark', label: 'Ember Grid', vibe: 'Industrial precision — carbon near-black, single ember-orange accent, dense data, hairline structure', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.375rem',
    tokens: darkBase({ background: '20 12% 5%', foreground: '30 15% 95%', card: '20 10% 7%', popover: '20 10% 7%', secondary: '20 10% 12%', muted: '20 10% 12%', 'muted-foreground': '25 8% 60%', accent: '20 12% 13%', 'accent-foreground': '22 80% 80%', border: '20 10% 15%', input: '20 10% 15%', primary: '22 90% 54%', 'primary-foreground': '20 80% 6%', ring: '22 90% 54%' }),
    gradientHero: 'radial-gradient(120% 110% at 80% 0%, hsl(22 90% 54% / 0.15), transparent 60%)',
    domains: ['security', 'monitoring', 'devops', 'logistics', 'industrial', 'manufacturing', 'energy', 'performance', 'automation'],
  },
  {
    id: 'precision-acid-dark', label: 'Acid Signal', vibe: 'Futurist precision — deep green-black, single acid-lime accent, technical and electric, restrained everywhere else', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.375rem',
    tokens: darkBase({ background: '150 12% 4%', foreground: '90 15% 95%', card: '150 10% 6%', popover: '150 10% 6%', secondary: '150 10% 11%', muted: '150 10% 11%', 'muted-foreground': '120 6% 60%', accent: '150 12% 12%', 'accent-foreground': '84 70% 78%', border: '150 10% 14%', input: '150 10% 14%', primary: '84 85% 52%', 'primary-foreground': '90 90% 6%', ring: '84 85% 52%' }),
    gradientHero: 'radial-gradient(120% 110% at 50% 0%, hsl(84 85% 52% / 0.14), transparent 60%)',
    domains: ['ai', 'ml', 'robotics', 'web3', 'gaming', 'esports', 'biotech', 'lab', 'science'],
  },
  {
    id: 'mono-dev-dark', label: 'Monochrome Dev', vibe: 'Pure monochrome — true black, near-white primary, zero color noise, typography and hairlines do all the work', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.375rem',
    tokens: darkBase({ background: '0 0% 4%', foreground: '0 0% 96%', card: '0 0% 6%', popover: '0 0% 6%', secondary: '0 0% 10%', muted: '0 0% 10%', 'muted-foreground': '0 0% 60%', accent: '0 0% 12%', 'accent-foreground': '0 0% 96%', border: '0 0% 14%', input: '0 0% 14%', primary: '0 0% 96%', 'primary-foreground': '0 0% 6%', ring: '0 0% 60%' }),
    gradientHero: 'radial-gradient(110% 100% at 50% 0%, hsl(0 0% 96% / 0.07), transparent 55%)',
    domains: ['developer', 'docs', 'opensource', 'cli', 'tooling', 'framework', 'sdk', 'library'],
  },
  // ── 2026 frontier: warm cream + serif (hospitality) ──
  {
    id: 'crema-fraunces-light', label: 'Crema', vibe: 'Warm hospitality — steamed-cream base, espresso-terracotta primary, soft characterful serif, inviting and tactile', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Fraunces', radius: '0.75rem',
    tokens: lightBase({ background: '35 45% 96%', foreground: '25 30% 12%', card: '35 45% 98%', popover: '35 45% 98%', muted: '33 30% 91%', 'muted-foreground': '28 12% 38%', secondary: '33 30% 91%', accent: '30 50% 90%', 'accent-foreground': '20 50% 30%', border: '33 25% 85%', input: '33 25% 85%', primary: '18 60% 42%', 'primary-foreground': '35 45% 97%', ring: '18 60% 42%' }),
    gradientHero: 'linear-gradient(150deg, hsl(18 60% 42% / 0.10), hsl(35 70% 60% / 0.12))',
    domains: ['hotel', 'hospitality', 'bakery', 'cafe', 'boutique', 'travel', 'bnb', 'resort', 'winery', 'restaurant', 'coffee'],
  },
  {
    id: 'clay-sand-light', label: 'Clay & Sand', vibe: 'Earthy craft — sun-baked sand base, fired-clay primary, organic warmth with precise structure', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Fraunces', radius: '0.625rem',
    tokens: lightBase({ background: '30 35% 96%', foreground: '18 25% 12%', card: '30 35% 98%', popover: '30 35% 98%', muted: '30 22% 90%', 'muted-foreground': '20 10% 38%', secondary: '30 22% 90%', accent: '30 40% 89%', 'accent-foreground': '16 45% 28%', border: '30 18% 84%', input: '30 18% 84%', primary: '16 55% 46%', 'primary-foreground': '30 35% 97%', ring: '16 55% 46%' }),
    gradientHero: 'linear-gradient(145deg, hsl(16 55% 46% / 0.12), hsl(35 50% 65% / 0.10))',
    domains: ['interior', 'furniture', 'craft', 'ceramics', 'home', 'decor', 'realestate', 'pottery', 'artisan'],
  },
  // ── 2026 frontier: gallery / brutalist / portfolio ──
  {
    id: 'gallery-red-light', label: 'Gallery Red', vibe: 'Gallery minimal — pure white walls, near-black type, ONE decisive red accent, sharp serif display, art does the talking', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Instrument Serif', radius: '0.125rem',
    tokens: lightBase({ background: '0 0% 99%', foreground: '0 0% 8%', card: '0 0% 100%', popover: '0 0% 100%', muted: '0 0% 95%', 'muted-foreground': '0 0% 40%', secondary: '0 0% 95%', accent: '0 0% 94%', 'accent-foreground': '0 0% 10%', border: '0 0% 89%', input: '0 0% 89%', primary: '358 75% 45%', 'primary-foreground': '0 0% 100%', ring: '358 75% 45%' }),
    gradientHero: 'linear-gradient(180deg, hsl(0 0% 8% / 0.03), hsl(358 75% 45% / 0.05))',
    domains: ['portfolio', 'photographer', 'artist', 'gallery', 'exhibition', 'architect', 'museum', 'curator'],
  },
  {
    id: 'brutalist-light', label: 'Brutalist', vibe: 'Neo-brutalist — stark white, jet-black primary, ZERO radius, heavy borders, highlighter-yellow accent, unapologetic type', mode: 'light',
    fontSans: 'General Sans', fontDisplay: 'General Sans', radius: '0rem',
    tokens: lightBase({ background: '0 0% 100%', foreground: '0 0% 6%', card: '0 0% 100%', popover: '0 0% 100%', muted: '0 0% 94%', 'muted-foreground': '0 0% 32%', secondary: '0 0% 94%', accent: '52 95% 60%', 'accent-foreground': '0 0% 8%', border: '0 0% 12%', input: '0 0% 12%', primary: '0 0% 8%', 'primary-foreground': '0 0% 100%', ring: '0 0% 8%' }),
    gradientHero: 'linear-gradient(180deg, hsl(52 95% 60% / 0.14), transparent 70%)',
    domains: ['studio', 'agency', 'designer', 'architecture', 'art', 'fashion', 'zine', 'collective'],
  },
  // ── 2026 frontier: commerce / market ──
  {
    id: 'forest-market-light', label: 'Forest Market', vibe: 'Honest commerce — warm ivory, deep forest-green primary, fresh and grounded, product-first', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.875rem',
    tokens: lightBase({ background: '40 40% 98%', foreground: '150 20% 10%', card: '40 40% 99%', popover: '40 40% 99%', muted: '45 25% 93%', 'muted-foreground': '150 8% 38%', secondary: '45 25% 93%', accent: '90 40% 92%', 'accent-foreground': '150 40% 22%', border: '45 20% 87%', input: '45 20% 87%', primary: '152 55% 30%', 'primary-foreground': '40 40% 98%', ring: '152 55% 30%' }),
    gradientHero: 'linear-gradient(150deg, hsl(152 55% 30% / 0.10), hsl(90 50% 55% / 0.10))',
    domains: ['ecommerce', 'shop', 'store', 'market', 'organic', 'grocery', 'retail', 'farm', 'produce'],
  },
  // ── 2026 frontier: finance / professional (light precision) ──
  {
    id: 'ledger-ivory-light', label: 'Ledger Ivory', vibe: 'Banking precision — ivory paper, deep bottle-green primary, tabular numbers, engraved calm (Mercury/Ramp energy)', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.5rem',
    tokens: lightBase({ background: '45 30% 97%', foreground: '160 15% 10%', card: '45 30% 99%', popover: '45 30% 99%', muted: '45 18% 92%', 'muted-foreground': '160 6% 38%', secondary: '45 18% 92%', accent: '160 25% 90%', 'accent-foreground': '162 50% 18%', border: '45 15% 86%', input: '45 15% 86%', primary: '162 65% 24%', 'primary-foreground': '45 30% 97%', ring: '162 65% 24%' }),
    gradientHero: 'linear-gradient(160deg, hsl(162 65% 24% / 0.08), hsl(45 40% 70% / 0.10))',
    domains: ['finance', 'accounting', 'invoice', 'tax', 'banking', 'payroll', 'wealth', 'treasury', 'bookkeeping'],
  },
  {
    id: 'counsel-navy-light', label: 'Counsel Navy', vibe: 'Professional counsel — warm off-white, deep navy primary, literary serif, measured and trustworthy', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Lora', radius: '0.375rem',
    tokens: lightBase({ background: '40 20% 97%', foreground: '220 30% 12%', card: '40 20% 99%', popover: '40 20% 99%', muted: '40 12% 92%', 'muted-foreground': '220 10% 38%', secondary: '40 12% 92%', accent: '221 30% 92%', 'accent-foreground': '221 45% 22%', border: '40 10% 86%', input: '40 10% 86%', primary: '221 55% 26%', 'primary-foreground': '40 20% 97%', ring: '221 55% 26%' }),
    gradientHero: 'linear-gradient(160deg, hsl(221 55% 26% / 0.08), hsl(40 30% 70% / 0.08))',
    domains: ['law', 'legal', 'consulting', 'insurance', 'advisory', 'firm', 'attorney', 'compliance', 'corporate'],
  },
  // ── 2026 frontier: nature / sustainability ──
  {
    id: 'moss-archive-light', label: 'Moss & Cream', vibe: 'Quiet sustainability — parchment cream, deep moss primary, botanical calm, literary serif accents', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'Lora', radius: '0.5rem',
    tokens: lightBase({ background: '60 25% 96%', foreground: '110 15% 12%', card: '60 25% 98%', popover: '60 25% 98%', muted: '80 15% 90%', 'muted-foreground': '100 8% 38%', secondary: '80 15% 90%', accent: '80 25% 88%', 'accent-foreground': '110 30% 24%', border: '80 12% 84%', input: '80 12% 84%', primary: '110 30% 32%', 'primary-foreground': '60 30% 96%', ring: '110 30% 32%' }),
    gradientHero: 'linear-gradient(150deg, hsl(110 30% 32% / 0.10), hsl(60 40% 65% / 0.10))',
    domains: ['nonprofit', 'environment', 'garden', 'farm', 'sustainable', 'outdoors', 'nature', 'climate', 'conservation'],
  },
  // ── 2026 frontier: sport / energy ──
  {
    id: 'track-red-light', label: 'Track Signal', vibe: 'Athletic clarity — clean white, signal-red primary, bold condensed-feel display, stat-heavy and fast', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.5rem',
    tokens: lightBase({ background: '0 0% 100%', foreground: '220 15% 8%', card: '0 0% 100%', popover: '0 0% 100%', muted: '220 10% 95%', 'muted-foreground': '220 6% 40%', secondary: '220 10% 95%', accent: '10 80% 94%', 'accent-foreground': '10 70% 32%', border: '220 10% 88%', input: '220 10% 88%', primary: '10 85% 50%', 'primary-foreground': '0 0% 100%', ring: '10 85% 50%' }),
    gradientHero: 'linear-gradient(135deg, hsl(10 85% 50% / 0.12), hsl(220 15% 8% / 0.06))',
    domains: ['sports', 'gym', 'coach', 'athlete', 'running', 'training', 'marathon', 'team', 'fitness'],
  },
  // ── 2026 frontier: travel / open air ──
  {
    id: 'open-air-light', label: 'Open Air', vibe: 'Wanderlust light — sky-washed white, clear cerulean primary, airy imagery-forward, horizon calm', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '0.875rem',
    tokens: lightBase({ background: '204 45% 98%', foreground: '210 25% 12%', card: '204 45% 99%', popover: '204 45% 99%', muted: '204 30% 94%', 'muted-foreground': '210 10% 42%', secondary: '204 30% 94%', accent: '204 40% 92%', 'accent-foreground': '206 60% 26%', border: '204 25% 88%', input: '204 25% 88%', primary: '203 80% 44%', 'primary-foreground': '0 0% 100%', ring: '203 80% 44%' }),
    gradientHero: 'linear-gradient(160deg, hsl(203 80% 44% / 0.12), hsl(204 60% 80% / 0.14))',
    domains: ['travel', 'flight', 'weather', 'booking', 'adventure', 'tour', 'beach', 'island', 'airline', 'outdoors'],
  },
  // ── 2026 frontier: night hospitality ──
  {
    id: 'supper-club-dark', label: 'Supper Club', vibe: 'Late-night dining — deep candlelit brown-black, coral-red primary, warm serif, intimate and appetizing', mode: 'dark',
    fontSans: 'Switzer', fontDisplay: 'Fraunces', radius: '0.625rem',
    tokens: darkBase({ background: '15 20% 6%', foreground: '30 30% 94%', card: '15 18% 8%', popover: '15 18% 8%', secondary: '15 14% 13%', muted: '15 14% 13%', 'muted-foreground': '20 10% 62%', accent: '15 18% 14%', 'accent-foreground': '8 70% 82%', border: '15 14% 16%', input: '15 14% 16%', primary: '8 75% 58%', 'primary-foreground': '15 60% 7%', ring: '8 75% 58%' }),
    gradientHero: 'radial-gradient(110% 100% at 50% 0%, hsl(8 75% 58% / 0.15), transparent 60%)',
    domains: ['restaurant', 'bar', 'nightlife', 'music', 'cocktail', 'dining', 'chef', 'venue', 'brewery'],
  },
  // ── 2026 frontier: education / community pop ──
  {
    id: 'cobalt-pop-light', label: 'Cobalt Pop', vibe: 'Bright learning — paper-white base, electric cobalt primary, warm yellow accent moments, energetic but disciplined', mode: 'light',
    fontSans: 'Switzer', fontDisplay: 'General Sans', radius: '1rem',
    tokens: lightBase({ background: '210 40% 99%', foreground: '224 30% 10%', card: '210 40% 100%', popover: '210 40% 100%', muted: '215 30% 95%', 'muted-foreground': '224 10% 42%', secondary: '215 30% 95%', accent: '48 95% 88%', 'accent-foreground': '35 80% 28%', border: '215 25% 89%', input: '215 25% 89%', primary: '224 85% 52%', 'primary-foreground': '0 0% 100%', ring: '224 85% 52%' }),
    gradientHero: 'linear-gradient(135deg, hsl(224 85% 52% / 0.12), hsl(48 95% 60% / 0.12))',
    domains: ['education', 'school', 'course', 'learning', 'community', 'event', 'youth', 'club', 'workshop', 'bootcamp'],
  },
]

const SANS_FALLBACK = "ui-sans-serif, system-ui, sans-serif"

// Generic/structural keywords that describe ANY app, not a vertical. These must
// NOT narrow the palette pool — otherwise "todo app" / "dashboard" always lands
// on the same (indigo) SaaS palettes and every build looks identical. Only a
// STRONG vertical signal (finance, health, food, luxury…) narrows the pool;
// everything else gets the full palette spread for real per-build variety.
const WEAK_DOMAINS = new Set([
  'saas', 'dashboard', 'tool', 'startup', 'landing', 'product', 'app',
  'admin', 'platform', 'internal', 'b2b', 'enterprise', 'website', 'site',
])

/** Pick a palette: narrow to a vertical only on a STRONG domain hint, else full
 *  pool (random) so generic apps get fresh colors each build. */
export function pickPalette(prompt: string, rnd: () => number = Math.random): Palette {
  const p = (prompt || '').toLowerCase()
  const matched = PALETTES.filter((pal) =>
    pal.domains.some((d) => !WEAK_DOMAINS.has(d) && p.includes(d)),
  )
  const pool = matched.length > 0 ? matched : PALETTES
  return pool[Math.floor(rnd() * pool.length)]
}

/** Look up a palette by its stable id (e.g. from a client-sent paletteId). */
export function getPaletteById(id: string | undefined | null): Palette | undefined {
  if (!id) return undefined
  return PALETTES.find((pal) => pal.id === id)
}

/** Pick n DISTINCT palette options for a "choose a direction" UI. Strong-domain
 *  matches come first (same narrowing rule as pickPalette); the rest are filled
 *  greedily for contrast — prefer a mode (light/dark) and id-family not already
 *  represented, so the options genuinely look different side by side. */
export function pickPaletteOptions(prompt: string, n = 3, rnd: () => number = Math.random): Palette[] {
  const p = (prompt || '').toLowerCase()
  const matched = PALETTES.filter((pal) =>
    pal.domains.some((d) => !WEAK_DOMAINS.has(d) && p.includes(d)),
  )
  const shuffle = (arr: Palette[]): Palette[] => {
    const a = [...arr]
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1))
      ;[a[i], a[j]] = [a[j], a[i]]
    }
    return a
  }
  const family = (pal: Palette) => pal.id.split('-')[0]
  const picked: Palette[] = []
  const takeDiverse = (pool: Palette[]) => {
    let candidates = shuffle(pool)
    while (picked.length < n && candidates.length > 0) {
      const modes = new Set(picked.map((x) => x.mode))
      const families = new Set(picked.map(family))
      let best = candidates[0]
      let bestScore = -1
      for (const pal of candidates) {
        const score = (modes.has(pal.mode) ? 0 : 2) + (families.has(family(pal)) ? 0 : 1)
        if (score > bestScore) { best = pal; bestScore = score }
      }
      picked.push(best)
      candidates = candidates.filter((pal) => pal.id !== best.id)
    }
  }
  takeDiverse(matched)
  takeDiverse(PALETTES.filter((pal) => !picked.some((x) => x.id === pal.id)))
  return picked
}

/** Render a palette as the exact src/index.css :root block + a one-line brief. */
export function renderDesignBrief(pal: Palette): string {
  const order = [
    'background', 'foreground', 'card', 'card-foreground', 'popover', 'popover-foreground',
    'primary', 'primary-foreground', 'secondary', 'secondary-foreground',
    'muted', 'muted-foreground', 'accent', 'accent-foreground',
    'destructive', 'destructive-foreground', 'border', 'input', 'ring',
  ]
  const lines = order
    .filter((k) => pal.tokens[k])
    .map((k) => `  --${k}: ${pal.tokens[k]};`)
    .join('\n')
  const darkClass = pal.mode === 'dark'
    ? `\nIMPORTANT: this is a DARK theme — add className="dark" to the root element (or set it on <html>) and keep that base.`
    : ''
  return `\n\n━━━ DESIGN BRIEF — use this palette (${pal.vibe}) ━━━
Put these tokens in src/index.css :root, then build with semantic classes only (bg-background, bg-primary, text-foreground, border-border…). Keep this palette + contrast; don't fall back to a generic theme. Unless the user gave their own colors/brand, commit to this direction.
:root {
${lines}
  --radius: ${pal.radius};
  --font-sans: '${pal.fontSans}', ${SANS_FALLBACK};
  --font-display: '${pal.fontDisplay}', '${pal.fontSans}', ${SANS_FALLBACK};
  --font-mono: 'JetBrains Mono', ui-monospace, monospace;
  --gradient-hero: ${pal.gradientHero};
}
Use bg-[image:var(--gradient-hero)] for hero backdrops. Use font-mono (JetBrains Mono) for eyebrows, microlabels, captions and tabular numbers (text-xs uppercase tracking-widest). Give each viewport ONE oversized font-display moment — a headline or stat at display scale — and keep everything else calm.${darkClass}`
}
