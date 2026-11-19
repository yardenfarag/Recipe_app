// Keeps the localized store listings (legal/STORE_LISTINGS_*.txt) inside the store character limits,
// so a copy edit can't be rejected by App Store Connect or Play Console at paste time.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const legal = join(import.meta.dirname, '..', 'legal');
const text = readdirSync(legal)
  .filter((f) => /^STORE_LISTINGS_.+\.txt$/.test(f))
  .map((f) => readFileSync(join(legal, f), 'utf8').replace(/\r/g, ''))
  .join('\n');
const chars = (s) => [...s].length;

// One block per language, split on the "=== HEBREW (he) ===" style banners.
const languages = [...text.matchAll(/=+ [A-Z]+ \((\w+)\) =+\n([\s\S]*?)(?=\n=+ [A-Z]+ \(|$)/g)].map(([, code, body]) => {
  const fields = Object.fromEntries(
    [...body.matchAll(/^([A-Za-z ]+) \(≤(\d+)\): (.+)$/gm)].map(([, label, max, value]) => [
      `${label}`,
      { max: Number(max), value: value.trim() },
    ]),
  );
  const description = body.split(/^--- Full description.*---$/m)[1]?.trim() ?? '';
  const appStore = body.split('--- Google Play ---')[0];
  const field = (label, section) => section.match(new RegExp(`^${label} \\(≤\\d+\\): (.+)$`, 'm'))?.[1].trim() ?? '';
  return {
    code,
    fields,
    description,
    name: field('Name', appStore),
    subtitle: field('Subtitle', appStore),
    keywords: field('Keywords', appStore),
  };
});

describe('localized store listings', () => {
  it('has Spanish, Hebrew, Arabic and Russian', () => {
    expect(languages.map((l) => l.code).sort()).toEqual(['ar', 'es', 'he', 'ru']);
  });

  for (const lang of languages) {
    describe(lang.code, () => {
      it('has every field', () => {
        expect(Object.keys(lang.fields)).toEqual([
          'Name',
          'Subtitle',
          'Promotional text',
          'Keywords',
          'App name',
          'Short description',
        ]);
      });

      it('keeps every field within its limit', () => {
        for (const [label, { max, value }] of Object.entries(lang.fields)) {
          expect.soft(chars(value), `${label}: ${value}`).toBeLessThanOrEqual(max);
        }
      });

      it('keeps the full description within 4000 characters', () => {
        expect(lang.description.length).toBeGreaterThan(1000);
        expect(chars(lang.description)).toBeLessThanOrEqual(4000);
      });

      it("doesn't spend keywords on words already in the App Store name or subtitle", () => {
        const taken = new Set(`${lang.name} ${lang.subtitle}`.split(/[\s:]+/).filter(Boolean));
        const words = lang.keywords.split(/[,\s]+/).filter(Boolean);
        expect(words.filter((w) => taken.has(w))).toEqual([]);
        expect(words.length, 'duplicate keyword').toBe(new Set(words).size);
      });
    });
  }
});
