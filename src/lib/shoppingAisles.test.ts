import { describe, expect, it } from 'vitest';

import { normalizeShoppingAlias, shoppingAisleForName } from '@/lib/shoppingAisles';

describe('shoppingAisles', () => {
  it('maps scallions to green onion in produce', () => {
    expect(normalizeShoppingAlias('scallions')).toBe('green onion');
    expect(shoppingAisleForName('scallions')).toBe('produce');
  });

  it('puts chicken in meat and flour in pantry', () => {
    expect(shoppingAisleForName('chicken thighs')).toBe('meat');
    expect(shoppingAisleForName('all-purpose flour')).toBe('pantry');
  });

  it('does not mis-file eggplant, ground cumin, or black pepper', () => {
    expect(shoppingAisleForName('eggplant')).toBe('produce');
    expect(shoppingAisleForName('ground cumin')).toBe('spices');
    expect(shoppingAisleForName('black pepper')).toBe('spices');
    expect(shoppingAisleForName('eggs')).toBe('dairy');
    expect(shoppingAisleForName('ground beef')).toBe('meat');
  });
});
