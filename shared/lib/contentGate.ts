export type ContentKind = 'written_recipe' | 'plated_dish' | 'mixed' | 'unrelated';

export type SnapRoute = 'extract' | 'offer_invent' | 'reject';

/** Client routing for the cheap food gate (mirrors Edge Function kinds). */
export function snapRouteForKind(kind: ContentKind): SnapRoute {
  if (kind === 'unrelated') return 'reject';
  if (kind === 'plated_dish') return 'offer_invent';
  return 'extract';
}

export function inventAllowedForKind(kind: ContentKind): boolean {
  return kind !== 'unrelated';
}

export function shouldOfferInvent(code?: string): boolean {
  return code === 'looks_like_dish' || code === 'no_recipe';
}

export function isFoodGateReject(code?: string): boolean {
  return code === 'not_food';
}
