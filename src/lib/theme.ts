// WyberAi brand tokens — matched to the web app's design system (globals.css).
// The mobile app is a build tool, so it uses the web's always-dark IDE palette
// (--bg-base/--bg-surface/--ide-*) plus the sky accent. Fonts: General Sans
// (display, self-hosted TTF) for brand/headings; system font for body.

export const brand = {
  // Surfaces — web IDE dark (--bg-base, --bg-surface, --bg-elevated, --ide-border)
  bg: '#0C0C10',
  surface: '#111116',
  surfaceAlt: '#18181F',
  border: '#2A2A35',

  // Text — web --ide-text / --ide-text2 / --ide-text3
  text: '#EEEEF4',
  textMuted: '#7878A0',
  textFaint: '#44445A',

  // Accent — web --sky (#0EA5E9) / --sky2 (#0284C7)
  accent: '#0EA5E9',
  accentDim: '#0284C7',
  onAccent: '#FFFFFF',

  // Status — web --ide-green / --ide-red / --ide-amber
  success: '#22C55E',
  danger: '#EF4444',
  warning: '#F59E0B',

  // Secondary accent — onboarding's agent-team slide, kept distinct from the
  // primary sky accent so multi-slide/multi-card moments can differentiate.
  violet: '#A855F7',
  // Light-tinted accent for text/icons drawn on a solid accent background
  // (e.g. the splash overlay's wordmark), where a plain white reads flatter.
  accentSoft: '#DCF3FF',

  // Glassmorphic surfaces (GlassCard's Android fallback, tab bar, sheet
  // headers) — translucent, so these are independent of `surface`/`border`
  // rather than derived from them.
  glassSurface: 'rgba(18,19,32,0.85)',
  glassBorder: 'rgba(255,255,255,0.08)',
} as const;

// Web radii: --r-sm 6, --r 10, --r-lg 14.
export const radius = { sm: 6, md: 10, lg: 14, pill: 999 } as const;

// Web 8px rhythm (--space-*).
export const space = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;

// General Sans (self-hosted, matches web --font-display). Loaded in the root
// layout via expo-font. Body text stays on the system font (Switzer is
// woff2-only, which React Native can't load).
export const font = {
  display: 'GeneralSans-Bold', // 700 — wordmark, headings, buttons
  displayMedium: 'GeneralSans-Semibold', // 600 — subheads, labels
  sans: undefined as string | undefined, // body → system
} as const;

// Motion — ported verbatim from the web design system (globals.css). The
// signature easing is a soft "expo-out" curve; durations mirror --t / --t-slow
// / --reveal. Keeping these identical to the site is what makes the app feel
// like the same product, not a separate build. Consumed by the Reanimated
// helpers (FadeInUp, BottomSheet, Skeleton) via Easing.bezier(...motion.ease).
export const motion = {
  // cubic-bezier(0.16, 1, 0.3, 1) — web --ease
  ease: [0.16, 1, 0.3, 1] as const,
  // cubic-bezier(0.4, 0, 1, 1) — web --ease-in (for exits)
  easeIn: [0.4, 0, 1, 1] as const,
  duration: {
    fast: 150, // --t
    base: 350, // --t-slow
    reveal: 650, // --reveal
    shimmer: 1500, // @keyframes shimmer 1.5s
  },
  // Default entrance travel — matches web @keyframes fadeUp (translateY 20px).
  rise: 20,
} as const;

// Reanimated withSpring configs — for interaction-driven motion (sheets,
// press states) where a physics feel reads better than a fixed-duration
// timing curve. `motion.duration`/`motion.ease` above stay in place for
// entrance/exit animations ported 1:1 from the web's CSS keyframes.
export const SPRINGS = {
  /** Snappy — press feedback, small toggles. */
  SNAP: { mass: 0.4, stiffness: 400, damping: 30 },
  /** Standard — sheet/modal open-close, most UI transitions. */
  EASE: { mass: 0.7, stiffness: 200, damping: 20 },
  /** Floaty — hero/splash moments, low-frequency emphasis motion. */
  FLOAT: { mass: 1.0, stiffness: 120, damping: 16 },
} as const;
