import { describe, expect, it } from 'vitest';

import { canonicalUnitKey, isCountUnit, isKnownCulinaryUnit, localizeCulinaryUnit } from './culinaryUnits';
import { formatQuantity } from './formatQuantity';

describe('localizeCulinaryUnit plurals (PIN-53)', () => {
  it('uses the singular below 1 in Hebrew, English, Spanish and Arabic', () => {
    expect(formatQuantity(0.5, 'tsp', 'he')).toBe('½ כפית');
    expect(formatQuantity(0.75, 'cup', 'he')).toBe('¾ כוס');
    expect(formatQuantity(0.5, 'cups', 'en')).toBe('½ cup');
    expect(formatQuantity(0.5, 'cup', 'es')).toBe('½ taza');
    expect(formatQuantity(0.5, 'cup', 'ar')).toBe('½ كوب');
    expect(formatQuantity(1.5, 'cup', 'he')).toBe('1½ כוסות');
    expect(formatQuantity(2, 'cups', 'en')).toBe('2 cups');
  });

  it('has three Russian forms after whole numbers and the genitive after fractions', () => {
    expect(localizeCulinaryUnit('cup', 'ru', 1)).toBe('стакан');
    expect(localizeCulinaryUnit('cup', 'ru', 3)).toBe('стакана');
    expect(localizeCulinaryUnit('cup', 'ru', 5)).toBe('стаканов');
    expect(localizeCulinaryUnit('cup', 'ru', 11)).toBe('стаканов');
    expect(localizeCulinaryUnit('cup', 'ru', 21)).toBe('стакан');
    expect(localizeCulinaryUnit('cup', 'ru', 0.5)).toBe('стакана');
    expect(localizeCulinaryUnit('teaspoon', 'ru', 0.5)).toBe('чайной ложки');
    expect(localizeCulinaryUnit('tsp', 'ru', 5)).toBe('ч. л.');
  });

  it('keeps Arabic in the singular after 1, 2 and 11 up, plural for 3 to 10', () => {
    expect(localizeCulinaryUnit('tbsp', 'ar', 2)).toBe('ملعقة كبيرة');
    expect(localizeCulinaryUnit('tbsp', 'ar', 3)).toBe('ملاعق كبيرة');
    expect(localizeCulinaryUnit('cup', 'ar', 12)).toBe('كوب');
  });

  it('puts Hebrew cloves in the construct form', () => {
    expect(localizeCulinaryUnit('cloves', 'he', 2)).toBe('שיני');
    expect(localizeCulinaryUnit('שיניים', 'he', 4)).toBe('שיני');
    expect(localizeCulinaryUnit('clove', 'he', 1)).toBe('שן');
  });
});

describe('count words and phrases from other languages', () => {
  it('treats source-language count words as no unit', () => {
    for (const unit of ['יחידה', 'יחידות', "יח'", 'adet', 'Stück', 'шт.', 'pcs', 'unidades', 'pièce']) {
      expect(isCountUnit(unit)).toBe(true);
      expect(localizeCulinaryUnit(unit, 'en', 2)).toBe('');
    }
  });

  it('localizes phrases that stand where a unit goes', () => {
    expect(localizeCulinaryUnit('to taste', 'he', 0)).toBe('לפי הטעם');
    expect(localizeCulinaryUnit('selon le goût', 'en', 0)).toBe('to taste');
    expect(localizeCulinaryUnit('for frying', 'he', 1)).toBe('לטיגון');
    expect(localizeCulinaryUnit('handful', 'ru', 1)).toBe('горсть');
    expect(localizeCulinaryUnit('bunch', 'es', 1)).toBe('manojo');
  });

  it('reads Turkish, French and German units', () => {
    expect(localizeCulinaryUnit('çay kaşığı', 'he', 0.5)).toBe('כפית');
    expect(localizeCulinaryUnit('yemek kaşığı', 'en', 3)).toBe('tbsp');
    expect(localizeCulinaryUnit('su bardağı', 'en', 1)).toBe('cup');
    expect(localizeCulinaryUnit('c. à soupe', 'he', 1)).toBe('כף');
    expect(localizeCulinaryUnit('Päckchen', 'he', 1)).toBe('שקית');
    expect(localizeCulinaryUnit('Packung', 'he', 1)).toBe('אריזה');
    expect(isKnownCulinaryUnit('tutam')).toBe(true);
  });

  it('maps a Hebrew teaspoon back to the short form', () => {
    expect(canonicalUnitKey('כפית')).toBe('tsp');
    expect(localizeCulinaryUnit('כפית', 'ru', 0.5)).toBe('ч. л.');
  });

  it('leaves unknown units as written', () => {
    expect(localizeCulinaryUnit('shot', 'he', 1)).toBe('shot');
  });
});
