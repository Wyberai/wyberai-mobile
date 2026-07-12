import { Ionicons } from '@expo/vector-icons';

// Mirror of the web app's PLAN_FACTS (wyberai/src/lib/plans.ts). Keep the
// credits + tier list in sync with web — these are the FACTS shown on the
// subscription cards. Prices are NOT here: the paywall always reads the live,
// region-localized price from the store (pkg.product.priceString), never a
// hardcoded number.

export type PlanId = 'spark' | 'starter' | 'builder' | 'pro';

export interface PlanFacts {
  id: PlanId;
  name: string;
  /** Credits granted per month. */
  credits: number;
  tagline: string;
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  /** INR/UPI-only India entry tier — shown only when the store currency is INR. */
  inrOnly?: boolean;
  /** The store subscription id (before the base-plan suffix). Matches web. */
  subscriptionId: string;
}

// Order = display order (entry → flagship). Builder is the recommended tier.
export const PLANS: PlanFacts[] = [
  {
    id: 'spark',
    name: 'Spark',
    credits: 50,
    tagline: 'Dip your toes in',
    icon: 'flash-outline',
    color: '#f59e0b',
    inrOnly: true,
    subscriptionId: 'wyber_spark',
  },
  {
    id: 'starter',
    name: 'Starter',
    credits: 150,
    tagline: 'For regular side projects',
    icon: 'rocket-outline',
    color: '#22c55e',
    subscriptionId: 'wyber_starter',
  },
  {
    id: 'builder',
    name: 'Builder',
    credits: 500,
    tagline: 'Ship serious apps',
    icon: 'hammer-outline',
    color: '#0EA5E9',
    subscriptionId: 'wyber_builder',
  },
  {
    id: 'pro',
    name: 'Pro',
    credits: 1500,
    tagline: 'Go full-time',
    icon: 'diamond-outline',
    color: '#8b5cf6',
    subscriptionId: 'wyber_pro',
  },
];

/** The tier a store subscription product belongs to (`wyber_pro:annual` → pro). */
export function planForProductId(productId: string): PlanFacts | null {
  if (!productId) return null;
  const subId = productId.split(':')[0];
  return PLANS.find((p) => p.subscriptionId === subId) ?? null;
}

/** Recommended tier — visually highlighted on the paywall. */
export const RECOMMENDED_PLAN: PlanId = 'builder';
