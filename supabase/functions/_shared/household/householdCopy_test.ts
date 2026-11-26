import { assert, assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';

import { EMAIL_LOCALES, fill } from '../email/copy.ts';
import { HOUSEHOLD_COPY, plural } from './householdCopy.ts';

Deno.test('every locale has every household line, with its placeholders', () => {
  for (const locale of EMAIL_LOCALES) {
    const copy = HOUSEHOLD_COPY[locale];
    for (const [key, value] of Object.entries(copy)) {
      if (typeof value === 'string') assert(value.trim().length > 0, `${locale}.${key} is empty`);
    }
    assertEquals(copy.fallbackTitle, 'Pinch', `${locale} keeps Pinch in Latin`);
    for (const form of Object.values(copy.listAdded)) assertStringIncludes(form!, '{name}', `${locale} listAdded`);
    assertStringIncludes(copy.listAdded.other, '{count}', `${locale} listAdded.other has the count`);
    assertStringIncludes(copy.memberJoined, '{name}', `${locale} memberJoined`);
    assertStringIncludes(copy.memberLeft, '{name}', `${locale} memberLeft`);
    assertStringIncludes(copy.memberRemoved, '{name}', `${locale} memberRemoved`);
    assertStringIncludes(copy.removedYou, '{household}', `${locale} removedYou`);
    assertStringIncludes(copy.goingShoppingTitle, '{name}', `${locale} goingShoppingTitle`);
    assert(!copy.goingShoppingBody.includes('{'), `${locale} goingShoppingBody has no placeholder`);
  }
});

Deno.test('every plural form a language uses for 0 to 200 has its own line, or falls back to other', () => {
  for (const locale of EMAIL_LOCALES) {
    const forms = HOUSEHOLD_COPY[locale].listAdded;
    for (let count = 1; count <= 200; count++) {
      const line = fill(plural(locale, forms, count), { name: 'Dana', count });
      assert(!line.includes('{'), `${locale} ${count}: ${line}`);
      assertStringIncludes(line, 'Dana');
    }
  }
});

Deno.test('plurals follow each language', () => {
  const en = HOUSEHOLD_COPY.en.listAdded;
  assertEquals(fill(plural('en', en, 1), { name: 'Omer', count: 1 }), 'Omer added an item to the list.');
  assertEquals(fill(plural('en', en, 4), { name: 'Omer', count: 4 }), 'Omer added 4 items to the list.');
  const ru = HOUSEHOLD_COPY.ru.listAdded;
  assertEquals(plural('ru', ru, 1), ru.one);
  assertEquals(plural('ru', ru, 3), ru.few);
  assertEquals(plural('ru', ru, 5), ru.many);
  assertEquals(plural('ru', ru, 21), ru.one);
  const ar = HOUSEHOLD_COPY.ar.listAdded;
  assertEquals(plural('ar', ar, 2), ar.two);
  assertEquals(plural('ar', ar, 3), ar.few);
  assertEquals(plural('ar', ar, 11), ar.many);
  const he = HOUSEHOLD_COPY.he.listAdded;
  assertEquals(plural('he', he, 2), he.two);
  assertEquals(plural('he', he, 7), he.other);
});

Deno.test('Hebrew speaks to the reader in the plural', () => {
  const he = HOUSEHOLD_COPY.he;
  assertStringIncludes(he.goingShoppingBody, 'הוסיפו');
  assertStringIncludes(he.removedYou, 'אתם');
});
