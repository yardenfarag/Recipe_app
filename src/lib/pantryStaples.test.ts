import { describe, expect, it } from 'vitest';

import { filterPantryStaples, isPantryStaple } from './pantryStaples';

describe('isPantryStaple', () => {
  it('matches exact names ignoring case and spaces', () => {
    expect(isPantryStaple('Olive Oil', ['olive oil'])).toBe(true);
    expect(isPantryStaple('butter', ['olive oil'])).toBe(false);
  });

  it('matches a longer ingredient that contains the staple phrase', () => {
    expect(isPantryStaple('extra virgin olive oil', ['olive oil'])).toBe(true);
    expect(isPantryStaple('kosher salt', ['salt'])).toBe(true);
    expect(isPantryStaple('sea salt flakes', ['salt'])).toBe(true);
  });

  it('does not match a staple as a substring of another word', () => {
    expect(isPantryStaple('unsalted butter', ['salt'])).toBe(false);
    expect(isPantryStaple('salted butter', ['salt'])).toBe(false);
    expect(isPantryStaple('black peppercorns', ['pepper'])).toBe(false);
  });
});

describe('filterPantryStaples', () => {
  it('splits kept and skipped lines', () => {
    const { kept, skipped } = filterPantryStaples(
      [{ name: 'olive oil' }, { name: 'chicken' }, { name: 'salt' }],
      ['olive oil', 'salt'],
    );
    expect(kept.map((row) => row.name)).toEqual(['chicken']);
    expect(skipped.map((row) => row.name)).toEqual(['olive oil', 'salt']);
  });
});
