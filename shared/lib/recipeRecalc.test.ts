import { describe, expect, it } from 'vitest';

import { RECALC_UPDATING_MS, recalcUpdatingFields, recipeRecalcState } from './recipeRecalc';

const NOW = Date.parse('2026-11-08T12:00:00Z');
const ago = (ms: number) => new Date(NOW - ms).toISOString();

describe('recipeRecalcState', () => {
  it('is idle when nothing is pending', () => {
    expect(recipeRecalcState({ recalc_pending: [], recalc_started_at: ago(1000) }, NOW)).toEqual({
      kind: 'idle',
    });
    expect(recipeRecalcState({}, NOW)).toEqual({ kind: 'idle' });
    expect(recipeRecalcState(null, NOW)).toEqual({ kind: 'idle' });
  });

  it('shows pending fields as updating for the first two minutes', () => {
    const state = recipeRecalcState(
      { recalc_pending: ['calories', 'tags'], recalc_started_at: ago(30_000) },
      NOW,
    );
    expect(state).toEqual({
      kind: 'updating',
      fields: ['calories', 'tags'],
      remainingMs: RECALC_UPDATING_MS - 30_000,
    });
    expect(recalcUpdatingFields(state)).toEqual(['calories', 'tags']);
  });

  it('treats a run two minutes old or more as stale, with nothing shown as updating', () => {
    const state = recipeRecalcState(
      { recalc_pending: ['appliances'], recalc_started_at: ago(RECALC_UPDATING_MS) },
      NOW,
    );
    expect(state).toEqual({ kind: 'stale', fields: ['appliances'] });
    expect(recalcUpdatingFields(state)).toEqual([]);
  });

  it('treats pending fields with no start time as stale', () => {
    expect(recipeRecalcState({ recalc_pending: ['calories'], recalc_started_at: null }, NOW)).toEqual({
      kind: 'stale',
      fields: ['calories'],
    });
    expect(recipeRecalcState({ recalc_pending: ['calories'], recalc_started_at: 'garbage' }, NOW).kind).toBe(
      'stale',
    );
  });

  it('never stretches a start time ahead of the device clock past two minutes', () => {
    const state = recipeRecalcState(
      { recalc_pending: ['effort_level'], recalc_started_at: new Date(NOW + 60 * 60_000).toISOString() },
      NOW,
    );
    expect(state).toEqual({ kind: 'updating', fields: ['effort_level'], remainingMs: RECALC_UPDATING_MS });

    // Two minutes after this device first saw that run, it is stale whatever the server clock says.
    const row = {
      recalc_pending: ['effort_level' as const],
      recalc_started_at: new Date(NOW + 60 * 60_000).toISOString(),
    };
    expect(recipeRecalcState(row, NOW + RECALC_UPDATING_MS - 1, NOW).kind).toBe('updating');
    expect(recipeRecalcState(row, NOW + RECALC_UPDATING_MS, NOW)).toEqual({
      kind: 'stale',
      fields: ['effort_level'],
    });
  });

  it('ignores unknown and repeated field names', () => {
    const state = recipeRecalcState(
      {
        recalc_pending: ['calories', 'calories', 'servings' as never, 'ingredient_amounts'],
        recalc_started_at: ago(0),
      },
      NOW,
    );
    expect(recalcUpdatingFields(state)).toEqual(['calories', 'ingredient_amounts']);
  });
});
