/**
 * Shows the temperatures and lengths in a step in the reader's unit system (PIN-53): "Preheat to 350°F" reads
 * "Preheat to 180°C" for a Metric reader, and "אופים ב-180 מעלות" reads "אופים ב-350°F" for a US one. Pan sizes go
 * between inches and centimeters the same way.
 *
 * Display only, and deterministic: the same text and choice always give the same result. Amounts of an ingredient
 * ("3 tbsp butter") are `convertStepAmounts`'s job; this file leaves them alone.
 *
 * Rules:
 * - Oven heat is rounded to the steps ovens have: °C to the nearest 10 (350°F → 180°C), °F to the nearest 25
 *   (180°C → 350°F). Lower heat (a thermometer reading, sugar stages, proofing) is converted to the degree.
 * - A written pair ("350°F (180°C)", "180°C / 350°F") keeps only the reader's side.
 * - "180 degrees" with no scale is Celsius in Hebrew, Arabic, Russian and Spanish text. In English text it is taken as
 *   Fahrenheit only from 260 up, where a Celsius oven rarely goes; below that it is left as written.
 * - A bare letter ("350F", "180 C") counts only from 100 up, so "2 C flour" (cups) is never read as heat.
 * - Arabic-Indic digits are read, and written back the same way.
 */
import type { CulinaryUnitLanguage } from './culinaryUnits';
import type { UnitSystem } from './unitSystem';

const GAP = '[\\s\\u00a0\\u200e\\u200f\\u061c]*';
const DIGIT = '[0-9\\u0660-\\u0669\\u06f0-\\u06f9]';
const GLYPHS: Record<string, number> = {
  '½': 1 / 2,
  '¼': 1 / 4,
  '¾': 3 / 4,
  '⅓': 1 / 3,
  '⅔': 2 / 3,
  '⅛': 1 / 8,
  '⅜': 3 / 8,
  '⅝': 5 / 8,
  '⅞': 7 / 8,
};
const GLYPH = `[${Object.keys(GLYPHS).join('')}]`;
/** Mixed numbers first, so "1 1/2" isn't read as "1". */
const NUMBER = `(?:${DIGIT}+\\s+${DIGIT}+\\/${DIGIT}+|${DIGIT}+\\/${DIGIT}+|${DIGIT}+(?:[.,]${DIGIT}+)?(?:\\s?${GLYPH})?|${GLYPH})`;
const NOT_AFTER_NUMBER = '(?<![0-9\\u0660-\\u0669\\u06f0-\\u06f9/.,])';
const RANGE = `${GAP}(?:-|–|—|to|a|до|עד|إلى|and|y|и|ו-?|و)${GAP}`;
const NOT_LETTER = '(?![\\p{L}\\p{M}])';

const DEGREE = '[°º˚]';
const F_UNITS = [
  `${DEGREE}${GAP}F${NOT_LETTER}`,
  `${DEGREE}${GAP}Ф${NOT_LETTER}`,
  `${DEGREE}${GAP}ف${NOT_LETTER}`,
  `(?:[Dd]egrees?|[Dd]eg\\.?)${GAP}(?:[Ff]ahrenheit|F${NOT_LETTER})`,
  `[Gg]rados?${GAP}[Ff]ahrenheit`,
  `(?:מעלות${GAP})?פרנהייט`,
  `(?:(?:درجات|درجة)${GAP})?(?:فهرنهايت|فهرنهيت)`,
  `(?:градус(?:а|ов)?${GAP})?(?:по${GAP})?[Фф]аренгейт[ауе]?`,
  `[Ff]ahrenheit`,
  `F${NOT_LETTER}`,
];
const C_UNITS = [
  `${DEGREE}${GAP}[CС]${NOT_LETTER}`,
  `${DEGREE}${GAP}م${NOT_LETTER}`,
  `(?:[Dd]egrees?|[Dd]eg\\.?)${GAP}(?:[Cc]elsius|[Cc]entigrade|C${NOT_LETTER})`,
  `[Gg]rados?${GAP}(?:[Cc]elsius|[Cc]ent[íi]grados?)`,
  `(?:מעלות${GAP})?צלזיוס`,
  `(?:(?:درجات|درجة)${GAP})?(?:مئوية|سيليزية|سلزيوس)`,
  `(?:градус(?:а|ов)?${GAP})?(?:по${GAP})?[Цц]ельси[юя]`,
  `[Cc]elsius`,
  `[Cc]ent[íi]grados?`,
  `[CС]${NOT_LETTER}`,
];
const BARE_UNITS = [
  `${DEGREE}`,
  `[Dd]egrees?${NOT_LETTER}`,
  `[Gg]rados?${NOT_LETTER}`,
  `מעלות${NOT_LETTER}`,
  `(?:درجات|درجة)${NOT_LETTER}`,
  `градус(?:а|ов|ах)?${NOT_LETTER}`,
];

const TEMPERATURE = new RegExp(
  `${NOT_AFTER_NUMBER}(${NUMBER})(?:${RANGE}(${NUMBER}))?(${GAP})(${[...F_UNITS, ...C_UNITS, ...BARE_UNITS].join('|')})`,
  'gu',
);

const INCH_UNITS = [
  `-?${GAP}inch(?:es)?${NOT_LETTER}`,
  `${GAP}in\\.`,
  `″`,
  `"`,
  `-?${GAP}אינץ['׳’]?`,
  `-?${GAP}אינטש(?:ים)?`,
  `${GAP}(?:بوصات|بوصة|إنشات|إنش|انش)${NOT_LETTER}`,
  `${GAP}дюйм(?:а|ов)?${NOT_LETTER}`,
  `${GAP}pulgadas?${NOT_LETTER}`,
];
const CM_UNITS = [
  `${GAP}cm${NOT_LETTER}`,
  `${GAP}см${NOT_LETTER}`,
  `${GAP}ס["״]מ`,
  `${GAP}סנטימטר(?:ים)?`,
  `${GAP}(?:سنتيمترات|سنتيمتر|سم)${NOT_LETTER}`,
  `${GAP}cent[íi]metros?${NOT_LETTER}`,
  `${GAP}сантиметр(?:а|ов)?${NOT_LETTER}`,
];
const BY = `${GAP}(?:x|X|×|by|על|на|في|por)${GAP}`;
const LENGTH = new RegExp(
  `${NOT_AFTER_NUMBER}(${NUMBER}(?:${BY}${NUMBER}){0,2})(${[...INCH_UNITS, ...CM_UNITS].join('|')})`,
  'gu',
);

type Scale = 'metric' | 'us';
type Found = { start: number; end: number; scale: Scale; replacement: string };

/** Where a pair's second half may start: "350°F (180°C)", "180°C / 350°F", "350°F or 180°C". */
const PAIR_GAP = new RegExp(`^${GAP}(?:\\(|\\[|/|,|or|או|или|o|أو)?${GAP}$`, 'u');
const PAIR_CLOSE = new RegExp(`^${GAP}[)\\]]`, 'u');

function toAsciiDigits(value: string): string {
  return value
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[۰-۹]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

function parseNumber(raw: string): number {
  const text = toAsciiDigits(raw.trim());
  const glyph = text.match(new RegExp(`^(\\d*(?:[.,]\\d+)?)\\s?(${GLYPH})$`, 'u'));
  if (glyph) return Number((glyph[1] || '0').replace(',', '.')) + GLYPHS[glyph[2]];
  const mixed = text.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const fraction = text.match(/^(\d+)\/(\d+)$/);
  if (fraction) return Number(fraction[1]) / Number(fraction[2]);
  return Number(text.replace(',', '.'));
}

function usesArabicDigits(raw: string): boolean {
  return /[٠-٩]/.test(raw);
}

function writeDigits(value: string, arabic: boolean): string {
  return arabic ? value.replace(/\d/g, (d) => String.fromCharCode(0x0660 + Number(d))) : value;
}

function scriptLanguage(text: string): CulinaryUnitLanguage {
  if (/[֐-׿]/u.test(text)) return 'he';
  if (/[؀-ۿ]/u.test(text)) return 'ar';
  if (/[Ѐ-ӿ]/u.test(text)) return 'ru';
  return 'en';
}

function decimalComma(language: CulinaryUnitLanguage): boolean {
  return language === 'ru' || language === 'es' || language === 'de' || language === 'fr';
}

function formatNumber(value: number, language: CulinaryUnitLanguage, arabic: boolean): string {
  const rounded = Math.round(value * 10) / 10;
  let text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(1);
  if (decimalComma(language)) text = text.replace('.', ',');
  return writeDigits(text, arabic);
}

// ---------------------------------------------------------------- temperature

/** Oven heat from about 120°C / 250°F up; below it, readings are kept to the degree. */
export function fahrenheitToCelsius(f: number): number {
  const c = ((f - 32) * 5) / 9;
  return f >= 250 ? Math.round(c / 10) * 10 : Math.round(c);
}

export function celsiusToFahrenheit(c: number): number {
  const f = (c * 9) / 5 + 32;
  // Nudged down 2°F so the usual oven dials come out (170°C → 325°F, 175°C → 350°F, 200°C → 400°F).
  return c >= 120 ? Math.round((f - 2) / 25) * 25 : Math.round(f);
}

function temperatureScale(unit: string, value: number, language: CulinaryUnitLanguage, text: string): Scale | null {
  const trimmed = unit.trim();
  const bareLetter = /^[FCС]$/u.test(trimmed);
  if (bareLetter && value < 100) return null;
  if (/F|Ф|ف|פרנהייט|[Фф]аренгейт|ahrenheit/u.test(trimmed)) return 'us';
  if (/C|С|م|צלזיוס|مئوية|سيليزية|سلزيوس|[Цц]ельси|elsius|entigrade|ent[íi]grad/u.test(trimmed)) return 'metric';
  // No scale written.
  const english = language === 'en' && scriptLanguage(text) === 'en';
  if (!english) return 'metric';
  return value >= 260 ? 'us' : null;
}

function findTemperatures(text: string, units: UnitSystem, language: CulinaryUnitLanguage): Found[] {
  const found: Found[] = [];
  TEMPERATURE.lastIndex = 0;
  for (const match of text.matchAll(TEMPERATURE)) {
    const [whole, lowRaw, highRaw, , unit] = match;
    const start = match.index ?? 0;
    const low = parseNumber(lowRaw);
    const high = highRaw ? parseNumber(highRaw) : null;
    if (!Number.isFinite(low) || (high != null && !Number.isFinite(high))) continue;
    const scale = temperatureScale(unit, Math.max(low, high ?? low), language, text);
    if (!scale) continue;
    let replacement = whole;
    if (scale !== units) {
      const convert = units === 'metric' ? fahrenheitToCelsius : celsiusToFahrenheit;
      const arabic = usesArabicDigits(lowRaw);
      const label = units === 'metric' ? '°C' : '°F';
      const lowValue = convert(low);
      const highValue = high == null ? null : convert(high);
      const lowText = writeDigits(String(lowValue), arabic);
      // A range whose ends round to the same dial reads as that one value. In Hebrew and Arabic the range takes a
      // plain hyphen: between two numbers it keeps their order, where an en dash would flip it ("180°C–160").
      const dash = language === 'he' || language === 'ar' ? '-' : '–';
      replacement =
        highValue == null || highValue === lowValue
          ? `${lowText}${label}`
          : `${lowText}${dash}${writeDigits(String(highValue), arabic)}${label}`;
    }
    found.push({ start, end: start + whole.length, scale, replacement });
  }
  return found;
}

// ---------------------------------------------------------------- length

const LENGTH_LABEL: Record<Scale, Record<CulinaryUnitLanguage, string>> = {
  metric: { en: 'cm', es: 'cm', he: 'ס״מ', ru: 'см', ar: 'سم', de: 'cm', fr: 'cm' },
  us: { en: 'in', es: 'pulg.', he: 'אינץ׳', ru: 'дюйм.', ar: 'بوصة', de: 'Zoll', fr: 'po' },
};

function inchesToCm(inches: number): number {
  const cm = inches * 2.54;
  return cm >= 3 ? Math.round(cm) : Math.round(cm * 2) / 2;
}

const QUARTER_GLYPHS: Record<number, string> = { 0.25: '¼', 0.5: '½', 0.75: '¾' };

function cmToInches(cm: number): { value: number; text: (arabic: boolean, language: CulinaryUnitLanguage) => string } {
  const exact = cm / 2.54;
  // Pans in whole inches; thicknesses to the quarter inch.
  const inches = exact >= 2 ? Math.round(exact) : Math.max(0.25, Math.round(exact * 4) / 4);
  return {
    value: inches,
    text: (arabic) => {
      const whole = Math.floor(inches);
      const glyph = QUARTER_GLYPHS[inches - whole];
      return writeDigits(glyph ? `${whole > 0 ? whole : ''}${glyph}` : String(whole), arabic);
    },
  };
}

function findLengths(text: string, units: UnitSystem, language: CulinaryUnitLanguage): Found[] {
  const found: Found[] = [];
  LENGTH.lastIndex = 0;
  for (const match of text.matchAll(LENGTH)) {
    const [whole, numbersRaw, unitRaw] = match;
    const start = match.index ?? 0;
    const unit = unitRaw.trim().replace(/^-/, '').trim();
    // A straight quote is an inch mark only right after the number: 9" pan.
    if ((unit === '"' || unit === '″') && unitRaw !== unit) continue;
    const scale: Scale = /^(?:cm|см|ס["״]מ|סנטימטר|سم|سنتيمتر|cent[íi]metro|сантиметр)/u.test(unit) ? 'metric' : 'us';
    let replacement = whole;
    if (scale !== units) {
      const parts = numbersRaw.split(new RegExp(BY, 'u'));
      const values = parts.map(parseNumber);
      if (values.some((v) => !Number.isFinite(v) || v <= 0)) continue;
      const arabic = usesArabicDigits(numbersRaw);
      const converted =
        units === 'metric'
          ? values.map((v) => formatNumber(inchesToCm(v), language, arabic))
          : values.map((v) => cmToInches(v).text(arabic, language));
      replacement = `${converted.join(' × ')} ${LENGTH_LABEL[units][language]}`;
    }
    found.push({ start, end: start + whole.length, scale, replacement });
  }
  return found;
}

// ---------------------------------------------------------------- rewrite

/** Replaces each find, and collapses a written pair to the reader's side. */
function rewrite(text: string, found: Found[], units: UnitSystem): string {
  let out = '';
  let at = 0;
  for (let i = 0; i < found.length; i += 1) {
    const current = found[i];
    const next = found[i + 1];
    if (next && next.scale !== current.scale) {
      const gap = text.slice(current.end, next.start);
      if (PAIR_GAP.test(gap)) {
        const opened = /[([]/.test(gap);
        const close = opened ? text.slice(next.end).match(PAIR_CLOSE) : null;
        if (!opened || close) {
          const keep = current.scale === units ? current : next;
          out += text.slice(at, current.start) + text.slice(keep.start, keep.end);
          at = next.end + (close ? close[0].length : 0);
          i += 1;
          continue;
        }
      }
    }
    out += text.slice(at, current.start) + current.replacement;
    at = current.end;
  }
  return out + text.slice(at);
}

/**
 * The step `text` with its temperatures and lengths in `units`. `language` is the language the text is in (the
 * recipe's display language); without it the script decides (Hebrew, Arabic, Cyrillic, else English).
 */
export function convertStepUnits(
  text: string,
  units: UnitSystem,
  language: CulinaryUnitLanguage | null = null,
): string {
  if (!text) return text;
  const lang = language ?? scriptLanguage(text);
  const withTemperatures = rewrite(text, findTemperatures(text, units, lang), units);
  return rewrite(withTemperatures, findLengths(withTemperatures, units, lang), units);
}
