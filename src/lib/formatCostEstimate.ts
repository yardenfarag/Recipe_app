import * as Localization from 'expo-localization';

import { CostEstimate } from '@/types/recipe';

/**
 * ADR 008 — cost tier is stored locale-agnostic; display maps it per device
 * region. Regions not listed here fall back to text labels (Budget/
 * Moderate/Premium) rather than guessing a currency symbol — deliberate
 * per ADR 008, not an oversight, but kept as wide as practical.
 */
const CURRENCY_SYMBOL_BY_REGION: Record<string, string> = {
  // USD
  US: '$',
  CA: '$',
  AU: '$',
  NZ: '$',
  SG: '$',
  HK: '$',
  // Euro zone
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
  // Other single-currency regions
  IL: '₪',
  GB: '£',
  JP: '¥',
  CN: '¥',
  IN: '₹',
  KR: '₩',
  BR: 'R$',
  MX: '$',
  ZA: 'R',
  CH: 'CHF',
  SE: 'kr',
  NO: 'kr',
  DK: 'kr',
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

  // Only single-character symbols ($, €, £, ₪, ¥, ₹, ₩, R) repeat cleanly
  // into a "$$"-style tier indicator. Multi-character codes (CHF, kr, R$)
  // would otherwise concatenate into nonsense (e.g. "CHFCHF") — fall back
  // to the locale-neutral text label for those instead.
  if (symbol.length > 1) return TEXT_LABELS[tier];

  return symbol.repeat(tier.length);
}
