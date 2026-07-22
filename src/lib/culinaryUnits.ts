/**
 * Localize common culinary unit strings into a target recipe language.
 * Used when displaying / post-processing translations so leftovers like
 * "unit" / "cup" don't stay English next to Hebrew (etc.) ingredient names.
 */

export type CulinaryUnitLanguage = 'en' | 'es' | 'he' | 'ru' | 'ar' | 'de' | 'fr';

type UnitForms = { one: string; other: string };

/** English placeholder count units — recipes usually just show the number. */
const COUNT_UNIT_KEYS = new Set([
  'unit',
  'units',
  'pc',
  'pcs',
  'piece',
  'pieces',
  'each',
  'whole',
  'item',
  'items',
  'count',
  'x',
]);

function emptyAll(): Record<CulinaryUnitLanguage, UnitForms> {
  const blank = { one: '', other: '' };
  return { en: blank, es: blank, he: blank, ru: blank, ar: blank, de: blank, fr: blank };
}

function forms(
  map: Record<CulinaryUnitLanguage, UnitForms>,
): Record<CulinaryUnitLanguage, UnitForms> {
  return map;
}

/** Canonical English key → localized singular/plural forms. Empty = omit unit. */
const UNIT_MAP: Record<string, Record<CulinaryUnitLanguage, UnitForms>> = {
  unit: emptyAll(),
  units: emptyAll(),
  pc: emptyAll(),
  pcs: emptyAll(),
  piece: emptyAll(),
  pieces: emptyAll(),
  each: emptyAll(),
  whole: emptyAll(),
  item: emptyAll(),
  items: emptyAll(),
  count: emptyAll(),

  cup: forms({
    en: { one: 'cup', other: 'cups' },
    es: { one: 'taza', other: 'tazas' },
    he: { one: 'כוס', other: 'כוסות' },
    ru: { one: 'стакан', other: 'стакана' },
    ar: { one: 'كوب', other: 'أكواب' },
    de: { one: 'Tasse', other: 'Tassen' },
    fr: { one: 'tasse', other: 'tasses' },
  }),
  tbsp: forms({
    en: { one: 'tbsp', other: 'tbsp' },
    es: { one: 'cda', other: 'cdas' },
    he: { one: 'כף', other: 'כפות' },
    ru: { one: 'ст. л.', other: 'ст. л.' },
    ar: { one: 'ملعقة كبيرة', other: 'ملاعق كبيرة' },
    de: { one: 'EL', other: 'EL' },
    fr: { one: 'c. à s.', other: 'c. à s.' },
  }),
  tablespoon: forms({
    en: { one: 'tablespoon', other: 'tablespoons' },
    es: { one: 'cucharada', other: 'cucharadas' },
    he: { one: 'כף', other: 'כפות' },
    ru: { one: 'столовая ложка', other: 'столовые ложки' },
    ar: { one: 'ملعقة كبيرة', other: 'ملاعق كبيرة' },
    de: { one: 'Esslöffel', other: 'Esslöffel' },
    fr: { one: 'cuillère à soupe', other: 'cuillères à soupe' },
  }),
  tsp: forms({
    en: { one: 'tsp', other: 'tsp' },
    es: { one: 'cdta', other: 'cdtas' },
    he: { one: 'כפית', other: 'כפיות' },
    ru: { one: 'ч. л.', other: 'ч. л.' },
    ar: { one: 'ملعقة صغيرة', other: 'ملاعق صغيرة' },
    de: { one: 'TL', other: 'TL' },
    fr: { one: 'c. à c.', other: 'c. à c.' },
  }),
  teaspoon: forms({
    en: { one: 'teaspoon', other: 'teaspoons' },
    es: { one: 'cucharadita', other: 'cucharaditas' },
    he: { one: 'כפית', other: 'כפיות' },
    ru: { one: 'чайная ложка', other: 'чайные ложки' },
    ar: { one: 'ملعقة صغيرة', other: 'ملاعق صغيرة' },
    de: { one: 'Teelöffel', other: 'Teelöffel' },
    fr: { one: 'cuillère à café', other: 'cuillères à café' },
  }),
  g: forms({
    en: { one: 'g', other: 'g' },
    es: { one: 'g', other: 'g' },
    he: { one: 'גרם', other: 'גרם' },
    ru: { one: 'г', other: 'г' },
    ar: { one: 'غ', other: 'غ' },
    de: { one: 'g', other: 'g' },
    fr: { one: 'g', other: 'g' },
  }),
  kg: forms({
    en: { one: 'kg', other: 'kg' },
    es: { one: 'kg', other: 'kg' },
    he: { one: 'ק״ג', other: 'ק״ג' },
    ru: { one: 'кг', other: 'кг' },
    ar: { one: 'كغ', other: 'كغ' },
    de: { one: 'kg', other: 'kg' },
    fr: { one: 'kg', other: 'kg' },
  }),
  ml: forms({
    en: { one: 'ml', other: 'ml' },
    es: { one: 'ml', other: 'ml' },
    he: { one: 'מ״ל', other: 'מ״ל' },
    ru: { one: 'мл', other: 'мл' },
    ar: { one: 'مل', other: 'مل' },
    de: { one: 'ml', other: 'ml' },
    fr: { one: 'ml', other: 'ml' },
  }),
  liter: forms({
    en: { one: 'L', other: 'L' },
    es: { one: 'L', other: 'L' },
    he: { one: 'ליטר', other: 'ליטר' },
    ru: { one: 'л', other: 'л' },
    ar: { one: 'لتر', other: 'لتر' },
    de: { one: 'Liter', other: 'Liter' },
    fr: { one: 'litre', other: 'litres' },
  }),
  oz: forms({
    en: { one: 'oz', other: 'oz' },
    es: { one: 'oz', other: 'oz' },
    he: { one: 'אונקיות', other: 'אונקיות' },
    ru: { one: 'унций', other: 'унций' },
    ar: { one: 'أونصة', other: 'أونصات' },
    de: { one: 'oz', other: 'oz' },
    fr: { one: 'oz', other: 'oz' },
  }),
  lb: forms({
    en: { one: 'lb', other: 'lb' },
    es: { one: 'lb', other: 'lb' },
    he: { one: 'ליברה', other: 'ליברות' },
    ru: { one: 'фунт', other: 'фунта' },
    ar: { one: 'رطل', other: 'أرطال' },
    de: { one: 'lb', other: 'lb' },
    fr: { one: 'lb', other: 'lb' },
  }),
  clove: forms({
    en: { one: 'clove', other: 'cloves' },
    es: { one: 'diente', other: 'dientes' },
    he: { one: 'שן', other: 'שיניים' },
    ru: { one: 'зубчик', other: 'зубчика' },
    ar: { one: 'فص', other: 'فصوص' },
    de: { one: 'Zehe', other: 'Zehen' },
    fr: { one: 'gousse', other: 'gousses' },
  }),
  slice: forms({
    en: { one: 'slice', other: 'slices' },
    es: { one: 'rebanada', other: 'rebanadas' },
    he: { one: 'פרוסה', other: 'פרוסות' },
    ru: { one: 'ломтик', other: 'ломтика' },
    ar: { one: 'شريحة', other: 'شرائح' },
    de: { one: 'Scheibe', other: 'Scheiben' },
    fr: { one: 'tranche', other: 'tranches' },
  }),
  pinch: forms({
    en: { one: 'pinch', other: 'pinches' },
    es: { one: 'pizca', other: 'pizcas' },
    he: { one: 'קמצוץ', other: 'קמצוצים' },
    ru: { one: 'щепотка', other: 'щепотки' },
    ar: { one: 'رشة', other: 'رشات' },
    de: { one: 'Prise', other: 'Prisen' },
    fr: { one: 'pincée', other: 'pincées' },
  }),
  can: forms({
    en: { one: 'can', other: 'cans' },
    es: { one: 'lata', other: 'latas' },
    he: { one: 'קופסה', other: 'קופסאות' },
    ru: { one: 'банка', other: 'банки' },
    ar: { one: 'علبة', other: 'علب' },
    de: { one: 'Dose', other: 'Dosen' },
    fr: { one: 'boîte', other: 'boîtes' },
  }),
  package: forms({
    en: { one: 'package', other: 'packages' },
    es: { one: 'paquete', other: 'paquetes' },
    he: { one: 'אריזה', other: 'אריזות' },
    ru: { one: 'упаковка', other: 'упаковки' },
    ar: { one: 'عبوة', other: 'عبوات' },
    de: { one: 'Packung', other: 'Packungen' },
    fr: { one: 'paquet', other: 'paquets' },
  }),
  stick: forms({
    en: { one: 'stick', other: 'sticks' },
    es: { one: 'barra', other: 'barras' },
    he: { one: 'מקל', other: 'מקלות' },
    ru: { one: 'пачка', other: 'пачки' },
    ar: { one: 'عصا', other: 'عصي' },
    de: { one: 'Stange', other: 'Stangen' },
    fr: { one: 'plaquette', other: 'plaquettes' },
  }),
};

const ALIASES: Record<string, string> = {
  cups: 'cup',
  tsps: 'tsp',
  tbsps: 'tbsp',
  tablespoons: 'tablespoon',
  teaspoons: 'teaspoon',
  gram: 'g',
  grams: 'g',
  kilogram: 'kg',
  kilograms: 'kg',
  milliliter: 'ml',
  milliliters: 'ml',
  millilitre: 'ml',
  millilitres: 'ml',
  l: 'liter',
  litre: 'liter',
  liters: 'liter',
  litres: 'liter',
  ounce: 'oz',
  ounces: 'oz',
  'fl oz': 'oz',
  pound: 'lb',
  pounds: 'lb',
  lbs: 'lb',
  cloves: 'clove',
  slices: 'slice',
  pinches: 'pinch',
  cans: 'can',
  pack: 'package',
  packs: 'package',
  packages: 'package',
  pkt: 'package',
  sticks: 'stick',
};

function normalizeUnitKey(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

function canonicalKey(unit: string): string {
  const normalized = normalizeUnitKey(unit);
  return ALIASES[normalized] ?? normalized;
}

/** Canonical unit key for conversion / localization (cup, g, tbsp, …). */
export function canonicalUnitKey(unit: string): string {
  return canonicalKey(unit);
}

/**
 * Translate a culinary unit into the target language.
 * Returns '' for count placeholders (unit/pc/piece) so UI shows just the number.
 */
export function localizeCulinaryUnit(
  unit: string,
  language: CulinaryUnitLanguage,
  quantity = 1,
): string {
  const raw = unit?.trim() ?? '';
  if (!raw) return '';

  const key = canonicalKey(raw);
  const entry = UNIT_MAP[key];
  if (!entry) {
    if (COUNT_UNIT_KEYS.has(key)) return '';
    return raw;
  }

  const formsForLang = entry[language];
  const useSingular = quantity === 1 || quantity === -1;
  return (useSingular ? formsForLang.one : formsForLang.other).trim();
}

export function isCountUnit(unit: string): boolean {
  return COUNT_UNIT_KEYS.has(canonicalKey(unit));
}
