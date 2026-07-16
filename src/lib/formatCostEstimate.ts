import * as Localization from 'expo-localization';

import { CostEstimate } from '@/types/recipe';

/** ADR 008 — cost tier is stored locale-agnostic; display maps it per device region. */
const CURRENCY_SYMBOL_BY_REGION: Record<string, string> = {
  US: '$',
  CA: '$',
  AU: '$',
  NZ: '$',
  IL: '₪',
  GB: '£',
  DE: '€',
  FR: '€',
  ES: '€',
  IT: '€',
  NL: '€',
  PT: '€',
  IE: '€',
  AT: '€',
  BE: '€',
  FI: '€',
  GR: '€',
};

const TEXT_LABELS: Record<CostEstimate, string> = {
  $: 'Budget',
  $$: 'Moderate',
  $$$: 'Premium',
};

export function formatCostEstimate(tier: CostEstimate): string {
  const region = Localization.getLocales()[0]?.regionCode ?? undefined;
  const symbol = region ? CURRENCY_SYMBOL_BY_REGION[region] : undefined;

  if (!symbol) return TEXT_LABELS[tier];

  return symbol.repeat(tier.length);
}
