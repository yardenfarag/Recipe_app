import { describe, expect, it } from 'vitest';

import {
  inventAllowedForKind,
  isFoodGateReject,
  shouldOfferInvent,
  snapRouteForKind,
} from './contentGate';

describe('content gate routing', () => {
  it('extracts written recipes and mixed photos', () => {
    expect(snapRouteForKind('written_recipe')).toBe('extract');
    expect(snapRouteForKind('mixed')).toBe('extract');
  });

  it('offers invent for plated dishes and never extracts them', () => {
    expect(snapRouteForKind('plated_dish')).toBe('offer_invent');
  });

  it('rejects unrelated content before extract or invent', () => {
    expect(snapRouteForKind('unrelated')).toBe('reject');
    expect(inventAllowedForKind('unrelated')).toBe(false);
    expect(inventAllowedForKind('plated_dish')).toBe(true);
  });

  it('maps extract codes onto invent offers', () => {
    expect(shouldOfferInvent('looks_like_dish')).toBe(true);
    expect(shouldOfferInvent('no_recipe')).toBe(true);
    expect(shouldOfferInvent('not_food')).toBe(false);
    expect(isFoodGateReject('not_food')).toBe(true);
  });
});
