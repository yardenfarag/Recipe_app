/**
 * Localize common culinary unit strings into a target recipe language.
 * Used when displaying / post-processing translations so leftovers like
 * "unit" / "cup" don't stay English next to Hebrew (etc.) ingredient names.
 */

export type CulinaryUnitLanguage = 'en' | 'es' | 'he' | 'ru' | 'ar' | 'de' | 'fr';

/**
 * The words for one unit in one language. `one` and `other` are the singular and plural; Russian adds `few`
 * (2–4: стакана), `many` (5+: стаканов) and `fraction` (½: стакана). Missing ones fall back to `other`.
 */
type UnitForms = { one: string; other: string; few?: string; many?: string; fraction?: string };

/**
 * Count placeholders in every source language we see — recipes just show the number ("2 eggs", not "2 units
 * eggs"). PIN-53: Hebrew, Turkish, German, Russian, Spanish and French ones reached users untranslated.
 */
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
  'יחידה',
  'יחידות',
  "יח'",
  'יח׳',
  'adet',
  'tane',
  'stück',
  'stk',
  'шт',
  'штука',
  'штуки',
  'штук',
  'unidad',
  'unidades',
  'pieza',
  'piezas',
  'pièce',
  'pièces',
  'unité',
  'unités',
  'حبة',
  'حبات',
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

/** Canonical English key → localized forms. Empty = omit unit. */
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

  // Abbreviations come before the long forms: a localized word read back ("כפית") maps to the first entry.
  cup: forms({
    en: { one: 'cup', other: 'cups' },
    es: { one: 'taza', other: 'tazas' },
    he: { one: 'כוס', other: 'כוסות' },
    ru: { one: 'стакан', other: 'стакана', many: 'стаканов' },
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
    ru: { one: 'столовая ложка', other: 'столовые ложки', many: 'столовых ложек', fraction: 'столовой ложки' },
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
    ru: { one: 'чайная ложка', other: 'чайные ложки', many: 'чайных ложек', fraction: 'чайной ложки' },
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
    he: { one: 'אונקיה', other: 'אונקיות' },
    ru: { one: 'унция', other: 'унции', many: 'унций', fraction: 'унции' },
    ar: { one: 'أونصة', other: 'أونصات' },
    de: { one: 'oz', other: 'oz' },
    fr: { one: 'oz', other: 'oz' },
  }),
  lb: forms({
    en: { one: 'lb', other: 'lb' },
    es: { one: 'lb', other: 'lb' },
    he: { one: 'ליברה', other: 'ליברות' },
    ru: { one: 'фунт', other: 'фунта', many: 'фунтов' },
    ar: { one: 'رطل', other: 'أرطال' },
    de: { one: 'lb', other: 'lb' },
    fr: { one: 'lb', other: 'lb' },
  }),
  clove: forms({
    en: { one: 'clove', other: 'cloves' },
    es: { one: 'diente', other: 'dientes' },
    // Construct form: the unit sits before the ingredient ("2 שיני שום").
    he: { one: 'שן', other: 'שיני' },
    ru: { one: 'зубчик', other: 'зубчика', many: 'зубчиков' },
    ar: { one: 'فص', other: 'فصوص' },
    de: { one: 'Zehe', other: 'Zehen' },
    fr: { one: 'gousse', other: 'gousses' },
  }),
  slice: forms({
    en: { one: 'slice', other: 'slices' },
    es: { one: 'rebanada', other: 'rebanadas' },
    he: { one: 'פרוסה', other: 'פרוסות' },
    ru: { one: 'ломтик', other: 'ломтика', many: 'ломтиков' },
    ar: { one: 'شريحة', other: 'شرائح' },
    de: { one: 'Scheibe', other: 'Scheiben' },
    fr: { one: 'tranche', other: 'tranches' },
  }),
  pinch: forms({
    en: { one: 'pinch', other: 'pinches' },
    es: { one: 'pizca', other: 'pizcas' },
    he: { one: 'קמצוץ', other: 'קמצוצים' },
    ru: { one: 'щепотка', other: 'щепотки', many: 'щепоток' },
    ar: { one: 'رشة', other: 'رشات' },
    de: { one: 'Prise', other: 'Prisen' },
    fr: { one: 'pincée', other: 'pincées' },
  }),
  can: forms({
    en: { one: 'can', other: 'cans' },
    es: { one: 'lata', other: 'latas' },
    he: { one: 'קופסה', other: 'קופסאות' },
    ru: { one: 'банка', other: 'банки', many: 'банок' },
    ar: { one: 'علبة', other: 'علب' },
    de: { one: 'Dose', other: 'Dosen' },
    fr: { one: 'boîte', other: 'boîtes' },
  }),
  package: forms({
    en: { one: 'package', other: 'packages' },
    es: { one: 'paquete', other: 'paquetes' },
    he: { one: 'אריזה', other: 'אריזות' },
    ru: { one: 'упаковка', other: 'упаковки', many: 'упаковок' },
    ar: { one: 'عبوة', other: 'عبوات' },
    de: { one: 'Packung', other: 'Packungen' },
    fr: { one: 'paquet', other: 'paquets' },
  }),
  sachet: forms({
    en: { one: 'packet', other: 'packets' },
    es: { one: 'sobre', other: 'sobres' },
    he: { one: 'שקית', other: 'שקיות' },
    ru: { one: 'пакетик', other: 'пакетика', many: 'пакетиков' },
    ar: { one: 'كيس', other: 'أكياس' },
    de: { one: 'Päckchen', other: 'Päckchen' },
    fr: { one: 'sachet', other: 'sachets' },
  }),
  stick: forms({
    en: { one: 'stick', other: 'sticks' },
    es: { one: 'barra', other: 'barras' },
    he: { one: 'מקל', other: 'מקלות' },
    // A cinnamon or lemongrass stick; not пачка, a ~200 g pack (a US butter stick is 113 g).
    ru: { one: 'палочка', other: 'палочки', many: 'палочек' },
    ar: { one: 'عصا', other: 'عصي' },
    de: { one: 'Stange', other: 'Stangen' },
    fr: { one: 'plaquette', other: 'plaquettes' },
  }),
  bunch: forms({
    en: { one: 'bunch', other: 'bunches' },
    es: { one: 'manojo', other: 'manojos' },
    he: { one: 'צרור', other: 'צרורות' },
    ru: { one: 'пучок', other: 'пучка', many: 'пучков' },
    ar: { one: 'حزمة', other: 'حزم' },
    de: { one: 'Bund', other: 'Bund' },
    fr: { one: 'botte', other: 'bottes' },
  }),
  handful: forms({
    en: { one: 'handful', other: 'handfuls' },
    es: { one: 'puñado', other: 'puñados' },
    he: { one: 'חופן', other: 'חופנים' },
    ru: { one: 'горсть', other: 'горсти', many: 'горстей' },
    ar: { one: 'حفنة', other: 'حفنات' },
    de: { one: 'Handvoll', other: 'Handvoll' },
    fr: { one: 'poignée', other: 'poignées' },
  }),
  // Phrases that stand where a unit goes (PIN-53: old caches showed them in English).
  'to taste': forms({
    en: { one: 'to taste', other: 'to taste' },
    es: { one: 'al gusto', other: 'al gusto' },
    he: { one: 'לפי הטעם', other: 'לפי הטעם' },
    ru: { one: 'по вкусу', other: 'по вкусу' },
    ar: { one: 'حسب الذوق', other: 'حسب الذوق' },
    de: { one: 'nach Geschmack', other: 'nach Geschmack' },
    fr: { one: 'au goût', other: 'au goût' },
  }),
  'for frying': forms({
    en: { one: 'for frying', other: 'for frying' },
    es: { one: 'para freír', other: 'para freír' },
    he: { one: 'לטיגון', other: 'לטיגון' },
    ru: { one: 'для жарки', other: 'для жарки' },
    ar: { one: 'للقلي', other: 'للقلي' },
    de: { one: 'zum Braten', other: 'zum Braten' },
    fr: { one: 'pour la friture', other: 'pour la friture' },
  }),
  'for serving': forms({
    en: { one: 'for serving', other: 'for serving' },
    es: { one: 'para servir', other: 'para servir' },
    he: { one: 'להגשה', other: 'להגשה' },
    ru: { one: 'для подачи', other: 'для подачи' },
    ar: { one: 'للتقديم', other: 'للتقديم' },
    de: { one: 'zum Servieren', other: 'zum Servieren' },
    fr: { one: 'pour servir', other: 'pour servir' },
  }),
};

const ALIASES: Record<string, string> = {
  cups: 'cup',
  c: 'cup',
  tsps: 'tsp',
  tbsps: 'tbsp',
  tablespoons: 'tablespoon',
  teaspoons: 'teaspoon',
  t: 'tsp',
  gram: 'g',
  grams: 'g',
  gr: 'g',
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
  packet: 'sachet',
  packets: 'sachet',
  envelope: 'sachet',
  sticks: 'stick',
  bunches: 'bunch',
  handfuls: 'handful',
  // Older forms and other source languages, read back to the same keys.
  'שיניים': 'clove',
  'אונקיות': 'oz',
  'קורט': 'pinch',
  'çay kaşığı': 'tsp',
  'tatlı kaşığı': 'tsp',
  'yemek kaşığı': 'tbsp',
  'su bardağı': 'cup',
  'tutam': 'pinch',
  'çimdik': 'pinch',
  'diş': 'clove',
  'paket': 'sachet',
  'packung': 'package',
  'päckchen': 'sachet',
  'prise': 'pinch',
  'c à soupe': 'tablespoon',
  'c à café': 'teaspoon',
  'cas': 'tbsp',
  'càs': 'tbsp',
  'cac': 'tsp',
  'càc': 'tsp',
  'pincée': 'pinch',
  'gousse': 'clove',
  'gousses': 'clove',
  'cucharadas': 'tablespoon',
  'cucharaditas': 'teaspoon',
  'sobre': 'sachet',
  'ст л': 'tbsp',
  'ч л': 'tsp',
  'стакана': 'cup',
  'стаканов': 'cup',
  // A Russian pack (of pasta, of butter): a package, not a US stick.
  'пачка': 'package',
  'пачки': 'package',
  'пачек': 'package',
  'зубчика': 'clove',
  'зубчиков': 'clove',
  'щепотки': 'pinch',
  'a gusto': 'to taste',
  'al gusto': 'to taste',
  'au goût': 'to taste',
  'selon le goût': 'to taste',
  'à discrétion': 'to taste',
  'nach geschmack': 'to taste',
  'לפי טעם': 'to taste',
  'по вкусу': 'to taste',
  'حسب الرغبة': 'to taste',
  'حسب الذوق': 'to taste',
  'for deep-frying': 'for frying',
  'for deep frying': 'for frying',
  'for garnish': 'for serving',
  'to serve': 'for serving',
};

function normalizeUnitKey(unit: string): string {
  return unit.trim().toLowerCase().replace(/\./g, '').replace(/\s+/g, ' ');
}

/** Localized unit label → canonical English key (for converted / translated recipes). The first entry wins. */
const LOCALIZED_TO_CANONICAL: Record<string, string> = (() => {
  const map: Record<string, string> = {};
  for (const [canonical, langs] of Object.entries(UNIT_MAP)) {
    for (const formsForLang of Object.values(langs)) {
      for (const form of [formsForLang.one, formsForLang.other, formsForLang.few, formsForLang.many, formsForLang.fraction]) {
        const key = normalizeUnitKey(form ?? '');
        if (key && !(key in map)) map[key] = canonical;
      }
    }
  }
  return map;
})();

function canonicalKey(unit: string): string {
  const normalized = normalizeUnitKey(unit);
  if (COUNT_UNIT_KEYS.has(normalized)) return normalized;
  return ALIASES[normalized] ?? LOCALIZED_TO_CANONICAL[normalized] ?? normalized;
}

/** Canonical unit key for conversion / localization (cup, g, tbsp, …). */
export function canonicalUnitKey(unit: string): string {
  return canonicalKey(unit);
}

/**
 * The form after an amount, by language (PIN-53):
 * - English, Spanish, Hebrew, German, French: singular for 1 and for fractions below 1 ("½ cup", "½ כוס").
 * - Russian: 1, 21… → one; 2–4, 22–24… → few; 5–20… → many; a fraction → genitive singular ("½ стакана").
 * - Arabic: singular after 1, 2, 11 and up and after fractions ("2 كوب", "½ كوب"); plural for 3–10 ("3 أكواب").
 */
function formFor(entry: UnitForms, language: CulinaryUnitLanguage, quantity: number): string {
  const q = Math.abs(quantity);
  const whole = Number.isInteger(q);
  if (language === 'ru') {
    if (!whole) return entry.fraction ?? entry.few ?? entry.other;
    const last = q % 10;
    const lastTwo = q % 100;
    if (last === 1 && lastTwo !== 11) return entry.one;
    if (last >= 2 && last <= 4 && (lastTwo < 12 || lastTwo > 14)) return entry.few ?? entry.other;
    return entry.many ?? entry.other;
  }
  if (language === 'ar') {
    return whole && q >= 3 && q <= 10 ? entry.other : entry.one;
  }
  return q === 1 || (q > 0 && q < 1) ? entry.one : entry.other;
}

/**
 * Translate a culinary unit into the target language.
 * Returns '' for count placeholders (unit/pc/piece/יחידה/adet…) so UI shows just the number.
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

  return formFor(entry[language], language, quantity).trim();
}

export function isCountUnit(unit: string): boolean {
  return COUNT_UNIT_KEYS.has(canonicalKey(unit));
}

/** True when the unit is in UNIT_MAP (or a count placeholder). */
export function isKnownCulinaryUnit(unit: string): boolean {
  const key = canonicalKey(unit);
  return Boolean(UNIT_MAP[key]) || COUNT_UNIT_KEYS.has(key);
}
