/**
 * Central credit metering — single source of truth for all credit costs.
 *
 * Ported verbatim from the web app (src/lib/credits.ts). Keep in sync with
 * the web original — drift here means mobile and web charge (or gate model
 * tiers) differently for the identical action, and the server is the real
 * authority anyway (the server picks the model; clients never choose one), so this
 * copy only needs to match what the server actually enforces.
 */

export type ModelTier = 'fast' | 'default' | 'premium' | 'fable' | 'gpt' | 'wybercode'
/**
 * Real DB plan values written to profiles.plan by the Dodo webhook. 'business'
 * never existed on Dodo — a leftover from the pre-Dodo Stripe integration —
 * and is kept out of this union on purpose so it can't silently resurface.
 */
export type PlanId = 'free' | 'spark' | 'starter' | 'builder' | 'pro' | 'growth' | 'scale'
export type ActionType =
  | 'small-edit'
  | 'component'
  | 'web-build'
  | 'mobile-build'
  | 'website-build'
  | 'saas-build'
  | 'plan'
  | 'security-scan'
  | 'seo-scan'
  | 'agent-create'
  | 'agent-run'
  | 'workflow-create'
  | 'workflow-run'
  | 'ai-helper'
  | 'image-gen'
  | 'hero-image-gen'
  | 'audio-gen'
  | 'execution'
  | 'employee-run'
  | 'gtm-icp-sequence'
  | 'gtm-lead-enrich'
  | 'preview-access'

/**
 * Cost multiplier relative to fast/Sonnet. Only governs the actions that
 * still use flat BASE_COSTS × multiplier pricing — builds moved to tiered
 * pricing (BUILD_TIER_COSTS below); small-edit never used this either.
 */
export const MODEL_MULTIPLIERS: Record<ModelTier, number> = {
  fast:    0.5,
  default: 2.5,
  premium: 2.5,
  fable:   2.0,
  gpt:     2.5,
  wybercode: 0.25,
}

/**
 * Base credit costs at sonnet multiplier (1.0).
 * Multiply by MODEL_MULTIPLIERS[tier] and round.
 */
const BASE_COSTS: Record<ActionType, number> = {
  'small-edit':         2,
  'component':          8,
  'web-build':         30,
  'mobile-build':      30,
  'website-build':     30,
  'saas-build':        30,
  'plan':               5,
  'security-scan':    100,
  'seo-scan':         100,
  'agent-create':       5,
  'agent-run':          5,
  'workflow-create':    2,
  'workflow-run':       2,
  'ai-helper':          1,
  'image-gen':          3,
  'hero-image-gen':    20,
  'audio-gen':          5,
  'execution':          5,
  'employee-run':       5,
  'gtm-icp-sequence':   3,
  'gtm-lead-enrich':    1,
  'preview-access':     2,
}

// Game previews cost more than app previews — a second flat price, not a
// MODEL_MULTIPLIERS tier.
export const PREVIEW_ACCESS_GAME_COST = 5

export type BuildSizeTier = 'small' | 'medium' | 'large' | 'xl'
const BUILD_ACTIONS: ActionType[] = ['web-build', 'mobile-build', 'website-build', 'saas-build']

/**
 * Tiered build pricing — a price keyed on real build size instead of a flat
 * per-build price. See lib/staged-plan.ts for where totalPlannedFiles comes
 * from (Atlas's plan pass).
 */
const BUILD_TIER_COSTS: Record<BuildSizeTier, { fast: number; default: number }> = {
  small:  { fast: 30, default: 50 },
  medium: { fast: 50, default: 90 },
  large:  { fast: 80, default: 160 },
  xl:     { fast: 120, default: 260 },
}

/**
 * Buckets a build into a BuildSizeTier from signals already computed BEFORE
 * generation starts, so the price stays fixed and known upfront. Prefers the
 * real planned file count from the staged-plan pass; falls back to the
 * isComplex HIGH/LOW classifier for one-shot builds with no plan.
 */
export function resolveBuildTier(opts: { totalPlannedFiles?: number; isComplex?: boolean }): BuildSizeTier {
  const { totalPlannedFiles, isComplex } = opts
  if (typeof totalPlannedFiles === 'number' && totalPlannedFiles > 0) {
    if (totalPlannedFiles > 20) return 'xl'
    if (totalPlannedFiles > 10) return 'large'
    if (totalPlannedFiles > 4) return 'medium'
    return 'small'
  }
  return isComplex ? 'large' : 'small'
}

/** Largest planned-file count each tier covers — the inverse of resolveBuildTier. */
const BUILD_TIER_MAX_FILES: Record<Exclude<BuildSizeTier, 'xl'>, number> = { small: 4, medium: 10, large: 20 }
const BUILD_TIER_ORDER: BuildSizeTier[] = ['small', 'medium', 'large', 'xl']

/**
 * For the first-build credit wall: the biggest build SMALLER than the planned
 * one that the balance already covers, at the normal price for that size.
 * null when not even the smallest fits. Mirrors the web helper of the same name.
 */
export function largestAffordableSmallerBuild(
  action: ActionType, plannedTier: BuildSizeTier, credits: number,
): { tier: BuildSizeTier; maxFiles: number; cost: number } | null {
  const below = BUILD_TIER_ORDER.slice(0, BUILD_TIER_ORDER.indexOf(plannedTier)) as Exclude<BuildSizeTier, 'xl'>[]
  for (let i = below.length - 1; i >= 0; i--) {
    const tier = below[i]
    const cost = creditCost(action, 'fast', tier)
    if (cost <= credits) return { tier, maxFiles: BUILD_TIER_MAX_FILES[tier], cost }
  }
  return null
}

/**
 * Compute the credit cost for an action + model tier.
 * Always at least 1 credit.
 */
export function creditCost(action: ActionType, tier: ModelTier = 'default', buildTier?: BuildSizeTier): number {
  // Edits are priced explicitly, not by multiplier (web: 4cr fast / 10cr default).
  if (action === 'small-edit') return tier === 'fast' ? 4 : 10
  // Tiered build pricing — only applies when the caller resolved a size tier;
  // omitting buildTier falls through to the flat price below.
  if (buildTier && BUILD_ACTIONS.includes(action)) {
    const costs = BUILD_TIER_COSTS[buildTier]
    return tier === 'fast' ? costs.fast : costs.default
  }
  // hero-image-gen/audio-gen/preview-access call an image/TTS provider or
  // aren't a model call at all — MODEL_MULTIPLIERS tier scaling doesn't apply.
  if (action === 'hero-image-gen' || action === 'audio-gen' || action === 'preview-access' || action === 'security-scan' || action === 'seo-scan') return BASE_COSTS[action]
  const base = BASE_COSTS[action]
  const multiplier = MODEL_MULTIPLIERS[tier]
  return Math.max(1, Math.round(base * multiplier))
}

