import { describe, expect, it } from 'vitest';

import ar from './locales/ar';
import en from './locales/en';
import es from './locales/es';
import he from './locales/he';
import ru from './locales/ru';

function flatten(
  value: Record<string, unknown>,
  prefix = '',
): Record<string, string> {
  const result: Record<string, string> = {};
  for (const [key, child] of Object.entries(value)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof child === 'string') {
      result[path] = child;
    } else if (child && typeof child === 'object') {
      Object.assign(result, flatten(child as Record<string, unknown>, path));
    }
  }
  return result;
}

function interpolationKeys(value: string): string[] {
  return [...value.matchAll(/\{\{([^}]+)\}\}/g)].map((match) => match[1]).sort();
}

/**
 * A key a language may have beyond English: a plural form English doesn't use (Russian `_few`/`_many`, Hebrew `_two`,
 * Arabic `_zero`/`_two`/`_few`/`_many`), for a key English has as `_one`/`_other`. i18next picks these by the
 * language's plural rules, and falls back to English when one is missing.
 */
function extraPluralBase(key: string, language: string, english: Record<string, string>): string | null {
  const match = /^(.*)_(zero|one|two|few|many|other)$/.exec(key);
  if (!match) return null;
  const categories = new Intl.PluralRules(language).resolvedOptions().pluralCategories as string[];
  if (!categories.includes(match[2]) || !(`${match[1]}_other` in english)) return null;
  return `${match[1]}_other`;
}

describe('locale contracts', () => {
  const english = flatten(en);
  const locales = { es: flatten(es), he: flatten(he), ru: flatten(ru), ar: flatten(ar) };

  it.each(Object.entries(locales))('%s has the same translation keys', (name, locale) => {
    const missing = Object.keys(english).filter((key) => !(key in locale));
    const unknown = Object.keys(locale).filter(
      (key) => !(key in english) && !extraPluralBase(key, name, english),
    );
    expect(missing).toEqual([]);
    expect(unknown).toEqual([]);
  });

  it.each(Object.entries(locales))('%s keeps interpolation variables aligned', (name, locale) => {
    const mismatches: string[] = [];
    for (const [key, englishValue] of Object.entries(english)) {
      const ours = interpolationKeys(locale[key]);
      const theirs = interpolationKeys(englishValue);
      // A plural form may leave out {{count}} ("وصفة واحدة" already says one), but uses no other variable.
      const aligned = /_(zero|one|two|few|many|other)$/.test(key)
        ? ours.every((variable) => theirs.includes(variable)) &&
          theirs.every((variable) => variable === 'count' || ours.includes(variable))
        : JSON.stringify(ours) === JSON.stringify(theirs);
      if (!aligned) mismatches.push(key);
    }
    // Extra plural forms follow the same rule, against the English _other.
    for (const [key, value] of Object.entries(locale)) {
      const base = key in english ? null : extraPluralBase(key, name, english);
      if (!base) continue;
      const allowed = interpolationKeys(english[base]);
      if (interpolationKeys(value).some((variable) => !allowed.includes(variable))) mismatches.push(key);
    }
    expect(mismatches).toEqual([]);
  });

  it.each([
    ['ru', ru],
    ['ar', ar],
    ['he', he],
  ] as const)('%s has every plural form its language needs for the WhatsApp import', (name, locale) => {
    const strings = flatten(locale);
    const categories = new Intl.PluralRules(name).resolvedOptions().pluralCategories as string[];
    const bases = Object.keys(english)
      .filter((key) => key.startsWith('whatsappImport.') && key.endsWith('_other'))
      .map((key) => key.slice(0, -'_other'.length));
    const missing = bases.flatMap((base) =>
      categories.filter((category) => !(`${base}_${category}` in strings)).map((category) => `${base}_${category}`),
    );
    expect(missing).toEqual([]);
  });
});
