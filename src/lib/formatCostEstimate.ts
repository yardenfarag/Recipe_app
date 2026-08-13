import { CostEstimate } from '@/types/recipe';

export const COST_TIER_COUNT = 3;

export const COST_I18N_KEYS = {
  $: 'recipe.cost.budget',
  $$: 'recipe.cost.typical',
  $$$: 'recipe.cost.expensive',
} as const;

const FILLED_DOT = '\u25CF'; // ●
const EMPTY_DOT = '\u25CB'; // ○
/** Keep the meter LTR inside RTL strings so ●○○ never visually flips to ○○●. */
const LRI = '\u2066';
const PDI = '\u2069';

const TEXT_LABELS: Record<CostEstimate, string> = {
  $: 'Budget',
  $$: 'Typical',
  $$$: 'Expensive',
};

export function costFilledCount(tier: CostEstimate): number {
  return tier.length;
}

export function costMeterString(tier: CostEstimate): string {
  const filled = costFilledCount(tier);
  const meter = FILLED_DOT.repeat(filled) + EMPTY_DOT.repeat(COST_TIER_COUNT - filled);
  return `${LRI}${meter}${PDI}`;
}

/**
 * Compact cost label for text-only contexts: "●○○ Budget".
 * UI prefers `CostEstimateDisplay` so dots are drawn, not font glyphs.
 */
export function formatCostEstimate(
  tier: CostEstimate,
  textLabels: Record<CostEstimate, string> = TEXT_LABELS,
): string {
  return `${costMeterString(tier)} ${textLabels[tier]}`;
}
