import { describe, expect, it } from 'vitest';

import { APPLIANCE_KEYS, type RecipeAppliance } from './appliances';
import { MAX_AVOID_INSTRUCTION_CHARS, makeWithoutInstruction } from './avoidList';
import {
  APPLIANCE_CHECKLIST,
  BASIC_APPLIANCE_KEYS,
  applianceFit,
  applianceWorkaroundInstruction,
  checkKitchen,
  clearOwnedAppliancesUpdate,
  ownedAppliancesUpdate,
  ownsAppliance,
  readOwnedAppliances,
  specialOwnedCount,
  tickedAppliances,
  toggleAppliance,
  worthAskingAboutAppliances,
  type KitchenAppliances,
} from './ownedAppliances';

const NOW = () => new Date('2026-11-21T10:00:00.000Z');

function kitchenOf(owned: string[]): KitchenAppliances {
  return readOwnedAppliances(ownedAppliancesUpdate({}, owned as never[], NOW))!;
}

const item = (key: string, overrides: Partial<RecipeAppliance> = {}): RecipeAppliance =>
  ({ key, required: true, steps: [1], origin: 'source', ...overrides }) as RecipeAppliance;

describe('the checklist', () => {
  it('asks about every catalog key once, with the basics last', () => {
    const keys = APPLIANCE_CHECKLIST.flatMap((group) => group.keys);
    expect([...keys].sort()).toEqual([...APPLIANCE_KEYS].sort());
    expect(new Set(keys).size).toBe(keys.length);
    expect(APPLIANCE_CHECKLIST.at(-1)).toEqual({ id: 'basics', keys: ['stovetop', 'oven', 'microwave'] });
    expect(APPLIANCE_CHECKLIST[0].keys).toEqual(['toaster', 'grill', 'air_fryer', 'deep_fryer']);
  });
});

describe('readOwnedAppliances', () => {
  it('is null until a list is saved', () => {
    expect(readOwnedAppliances(undefined)).toBeNull();
    expect(readOwnedAppliances({})).toBeNull();
    expect(readOwnedAppliances({ appliances: null })).toBeNull();
    expect(readOwnedAppliances({ appliances: ['blender'] })).toBeNull();
    expect(readOwnedAppliances({ appliances: { notOwned: ['blender'] } })).toBeNull();
  });

  it('keeps known keys, in catalog order, and never lists one as both', () => {
    expect(
      readOwnedAppliances({ appliances: { owned: ['wok', 'blender', 'bread_machine', 3, 'wok'], notOwned: ['blender', 'smoker', 'nope'] } }),
    ).toEqual({ owned: ['blender', 'wok'], notOwned: ['smoker'] });
  });

  it('reads an empty list as "saved: none of these"', () => {
    expect(readOwnedAppliances({ appliances: { owned: [] } })).toEqual({ owned: [], notOwned: [] });
  });
});

describe('ownedAppliancesUpdate', () => {
  it('saves every key not ticked as not owned', () => {
    const data = ownedAppliancesUpdate({}, ['air_fryer', 'oven'], NOW);
    const stored = data.appliances as { owned: string[]; notOwned: string[]; savedAt: string };
    expect(stored.owned).toEqual(['oven', 'air_fryer']);
    expect(stored.notOwned).toHaveLength(APPLIANCE_KEYS.length - 2);
    expect(stored.notOwned).toContain('stovetop');
    expect(stored.savedAt).toBe('2026-11-21T10:00:00.000Z');
  });

  it('keeps what a newer build stored: unknown keys and fields', () => {
    const metadata = { appliances: { owned: ['blender', 'bread_machine'], notOwned: ['pasta_maker'], v: 2 }, prefs: { scheme: 'dark' } };
    const stored = ownedAppliancesUpdate(metadata, ['wok'], NOW).appliances as Record<string, unknown>;
    expect(stored.owned).toEqual(['wok', 'bread_machine']);
    expect(stored.notOwned).toContain('pasta_maker');
    expect(stored.notOwned).toContain('blender');
    expect(stored.v).toBe(2);
  });

  it('only ever writes its own key, so the other synced choices stay', () => {
    expect(Object.keys(ownedAppliancesUpdate({ prefs: {}, locale: 'he' }, [], NOW))).toEqual(['appliances']);
    expect(clearOwnedAppliancesUpdate()).toEqual({ appliances: null });
  });
});

describe('ownsAppliance and the ticks', () => {
  it('knows nothing before a list is saved', () => {
    expect(ownsAppliance(null, 'oven')).toBeNull();
    expect(ownsAppliance(null, 'blender')).toBeNull();
  });

  it('starts with the basics ticked', () => {
    expect([...tickedAppliances(null)]).toEqual(BASIC_APPLIANCE_KEYS);
    expect(toggleAppliance(null, 'blender')).toEqual(['stovetop', 'oven', 'microwave', 'blender']);
    expect(toggleAppliance(null, 'oven')).toEqual(['stovetop', 'microwave']);
  });

  it('follows the saved list', () => {
    const kitchen = kitchenOf(['stovetop', 'blender']);
    expect(ownsAppliance(kitchen, 'blender')).toBe(true);
    expect(ownsAppliance(kitchen, 'oven')).toBe(false);
    expect(ownsAppliance(kitchen, 'stand_mixer')).toBe(false);
    expect(specialOwnedCount(kitchen)).toBe(1);
  });

  it('treats an appliance that was never offered as unknown, and an unanswered basic as owned', () => {
    const kitchen: KitchenAppliances = { owned: ['blender'], notOwned: [] };
    expect(ownsAppliance(kitchen, 'stand_mixer')).toBeNull();
    expect(ownsAppliance(kitchen, 'oven')).toBe(true);
  });
});

describe('checkKitchen', () => {
  const cake = [item('stand_mixer'), item('oven', { steps: [2] }), item('kitchen_thermometer', { required: false, origin: 'tip' })];

  it('says nothing before a list is saved, or for a recipe never analysed', () => {
    expect(checkKitchen(cake, null)).toEqual({ missing: [], covered: [], ready: false });
    expect(checkKitchen(null, kitchenOf(['oven']))).toEqual({ missing: [], covered: [], ready: false });
  });

  it('names the required appliances the cook does not have', () => {
    expect(checkKitchen(cake, kitchenOf(['oven', 'stovetop']))).toEqual({ missing: ['stand_mixer'], covered: [], ready: false });
    expect(checkKitchen(cake, kitchenOf(['stand_mixer']))).toEqual({ missing: ['oven'], covered: [], ready: false });
  });

  it('is ready when everything required is there', () => {
    expect(checkKitchen(cake, kitchenOf(['oven', 'stand_mixer']))).toEqual({ missing: [], covered: [], ready: true });
  });

  it('never warns about optional items or tips', () => {
    const optional = [item('mortar_and_pestle', { required: false, benefit: 'richer_flavor', alternative: 'pre_ground' })];
    expect(checkKitchen(optional, kitchenOf([])).missing).toEqual([]);
    expect(checkKitchen(optional, kitchenOf([])).ready).toBe(false);
  });

  it('does not warn when the recipe names a stand-in the cook has', () => {
    const soup = [item('blender', { alternative: 'immersion_blender' })];
    expect(checkKitchen(soup, kitchenOf(['immersion_blender']))).toEqual({
      missing: [],
      covered: [{ key: 'blender', alternative: 'immersion_blender' }],
      ready: true,
    });
    expect(checkKitchen(soup, kitchenOf([])).missing).toEqual(['blender']);
    expect(checkKitchen([item('stand_mixer', { alternative: 'by_hand' })], kitchenOf([])).covered).toEqual([
      { key: 'stand_mixer', alternative: 'by_hand' },
    ]);
  });

  it('marks each chip', () => {
    const kitchen = kitchenOf(['oven', 'immersion_blender']);
    expect(applianceFit(item('oven'), kitchen)).toBe('owned');
    expect(applianceFit(item('blender', { alternative: 'immersion_blender' }), kitchen)).toBe('covered');
    expect(applianceFit(item('wok'), kitchen)).toBe('missing');
    expect(applianceFit(item('wok'), null)).toBeNull();
  });
});

describe('worthAskingAboutAppliances', () => {
  it('asks only before a list is saved, and only for a recipe that needs something special', () => {
    expect(worthAskingAboutAppliances([item('air_fryer')], null)).toBe(true);
    expect(worthAskingAboutAppliances([item('oven')], null)).toBe(false);
    expect(worthAskingAboutAppliances([item('air_fryer', { required: false })], null)).toBe(false);
    expect(worthAskingAboutAppliances([item('air_fryer')], kitchenOf([]))).toBe(false);
    expect(worthAskingAboutAppliances(null, null)).toBe(false);
  });
});

describe('applianceWorkaroundInstruction', () => {
  it('is null when nothing is missing', () => {
    expect(applianceWorkaroundInstruction([], kitchenOf([]))).toBeNull();
  });

  it('names what is missing and what the cook can use instead', () => {
    expect(applianceWorkaroundInstruction(['stand_mixer'], kitchenOf(['hand_mixer', 'oven']))).toBe(
      'My kitchen has no stand mixer: change the steps so I can make it without it. I can use my hand mixer',
    );
    expect(applianceWorkaroundInstruction(['blender', 'ice_cream_maker'], kitchenOf([]))).toBe(
      'My kitchen has no blender or ice cream maker: change the steps so I can make it without them',
    );
  });

  it('fits in the remix request with the avoid list', () => {
    const list = { allergies: ['milk', 'eggs', 'gluten'] as never[], otherAllergies: ['celery'], dislikes: [] };
    const text = makeWithoutInstruction(
      list,
      { allergies: [], dislikes: [], byIngredient: [] },
      applianceWorkaroundInstruction(['stand_mixer', 'blender', 'oven'], kitchenOf(['hand_mixer', 'food_processor', 'air_fryer'])),
    )!;
    expect(text.length).toBeLessThanOrEqual(MAX_AVOID_INSTRUCTION_CHARS);
    expect(text).toContain('My kitchen has no stand mixer, blender or oven');
  });
});
