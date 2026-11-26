import { describe, expect, it, vi } from 'vitest';

import type { PantryItem } from '@shared/types/pantry';

import { daysSinceLastScan, lastScanAt, makeAtHome, newScanId, pantryWhen, splitAtHome } from './pantryHelpers';

// Hoisted above the imports by Vitest.
vi.mock('@react-native-async-storage/async-storage', () => ({
  default: { getItem: vi.fn(), setItem: vi.fn(), removeItem: vi.fn() },
}));

const item = (over: Partial<PantryItem>): PantryItem => ({
  id: 'x',
  name: 'Milk',
  nameEn: 'milk',
  brand: '',
  place: 'fridge',
  aisle: 'dairy',
  source: 'scan',
  addedAt: '2026-11-01T00:00:00Z',
  lastSeenAt: '2026-11-01T00:00:00Z',
  ...over,
});

describe('makeAtHome', () => {
  it('counts staples and pantry items, the way the pantry matches names', () => {
    const atHome = makeAtHome(['salt', 'milk', 'brown sugar']);
    expect(atHome('sea salt')).toBe(true);
    expect(atHome('whole milk')).toBe(true);
    expect(atHome('sugar')).toBe(true);
    expect(atHome('eggs')).toBe(false);
  });

  it('splits ingredients into what to buy and what is at home', () => {
    const { kept, skipped } = splitAtHome([{ name: 'Milk' }, { name: 'Eggs' }], ['milk']);
    expect(kept.map((i) => i.name)).toEqual(['Eggs']);
    expect(skipped.map((i) => i.name)).toEqual(['Milk']);
  });
});

describe('pantryWhen', () => {
  const t = ((key: string, options?: { count?: number }) =>
    options?.count != null ? `${key}:${options.count}` : key) as never;
  it('says today, yesterday, or how many days ago', () => {
    expect(pantryWhen(0, t)).toBe('pantry.today');
    expect(pantryWhen(1, t)).toBe('pantry.yesterday');
    expect(pantryWhen(5, t)).toBe('pantry.daysAgo:5');
  });
});

describe('last scan', () => {
  it('only counts items that came from a scan', () => {
    const items = [
      item({ lastSeenAt: '2026-11-10T00:00:00Z' }),
      item({ source: 'manual', lastSeenAt: '2026-11-20T00:00:00Z' }),
    ];
    expect(lastScanAt(items)).toBe('2026-11-10T00:00:00Z');
    expect(lastScanAt([item({ source: 'manual' })])).toBeNull();
    expect(daysSinceLastScan([])).toBeNull();
  });
});

describe('newScanId', () => {
  it('is a v4 UUID the scan function accepts, with or without crypto.randomUUID', () => {
    const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
    expect(newScanId()).toMatch(uuid);
    const original = globalThis.crypto;
    vi.stubGlobal('crypto', undefined);
    try {
      expect(newScanId()).toMatch(uuid);
    } finally {
      vi.stubGlobal('crypto', original);
    }
  });
});
