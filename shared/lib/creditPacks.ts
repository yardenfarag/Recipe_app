/**
 * The recipe-credit packs both apps sell (ADR 012). The ids are the store product ids and the Polar products'
 * `metadata.pack_id`; supabase/functions/_shared/billing/polarPurchase.ts allowlists the same three.
 *
 * `priceUsd` is the catalog price. The app stores show their own localized price strings instead; the website
 * sells in US dollars through Polar, and formats this number in the reader's language.
 */
export const CREDIT_PACKS = [
  { id: 'pinch_credits_10', credits: 10, priceUsd: 1.99, catalogPrice: '$1.99' },
  { id: 'pinch_credits_30', credits: 30, priceUsd: 4.99, catalogPrice: '$4.99' },
  { id: 'pinch_credits_100', credits: 100, priceUsd: 7.99, catalogPrice: '$7.99' },
] as const;

export type CreditPackId = (typeof CREDIT_PACKS)[number]['id'];
export type CreditPackDefinition = (typeof CREDIT_PACKS)[number];

export const BEST_VALUE_PACK_ID: CreditPackId = 'pinch_credits_100';

export function isCreditPackId(value: unknown): value is CreditPackId {
  return CREDIT_PACKS.some((pack) => pack.id === value);
}

/** What one credit costs in this pack, in US dollars. */
export function pricePerCreditUsd(pack: Pick<CreditPackDefinition, 'credits' | 'priceUsd'>): number {
  return pack.priceUsd / pack.credits;
}

/**
 * How much cheaper a credit is in this pack than in the smallest one, as a fraction (0.6 = 60% less), rounded down
 * to a whole percent so the label never overstates it. 0 for the smallest pack.
 */
export function savingsVersusSmallest(pack: Pick<CreditPackDefinition, 'credits' | 'priceUsd'>): number {
  const base = Math.max(...CREDIT_PACKS.map(pricePerCreditUsd));
  const saving = 1 - pricePerCreditUsd(pack) / base;
  return Math.max(0, Math.floor(saving * 100) / 100);
}
