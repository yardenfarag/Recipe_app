/**
 * Kitchen appliance catalog and the sanitizer for a recipe's appliance list (ADR 017).
 *
 * This file exists twice and must stay byte-identical:
 *   src/lib/appliances.ts                      (app)
 *   supabase/functions/_shared/appliances.ts   (Edge Functions, Deno)
 * src/lib/appliances.test.ts fails when they differ. It has no imports so it runs in both.
 */

export const APPLIANCE_CATEGORIES = ['heat', 'slow_pressure', 'blend_mix', 'tools', 'specialist'] as const;
export type ApplianceCategory = (typeof APPLIANCE_CATEGORIES)[number];

/** `basic` = nearly every kitchen has it, so it is shown small and left off list cards. */
export type ApplianceTier = 'basic' | 'special';

type CatalogEntry = {
  category: ApplianceCategory;
  tier: ApplianceTier;
  /** Names the model or a user might use, in en, es, he, ru, ar, plus brands. Matched after normalizeApplianceName. */
  aliases: readonly string[];
};

/** Order here is display order within a group. Adding a key needs a name in every locale file. */
export const APPLIANCE_CATALOG = {
  // heat
  stovetop: {
    category: 'heat',
    tier: 'basic',
    aliases: ['stove', 'hob', 'cooktop', 'burner', 'gas stove', 'estufa', 'fogón', 'hornalla', 'vitrocerámica', 'כיריים', 'כירה', 'плита', 'конфорка', 'موقد', 'بوتاجاز'],
  },
  oven: {
    category: 'heat',
    tier: 'basic',
    aliases: ['conventional oven', 'convection oven', 'horno', 'תנור', 'духовка', 'духовой шкаф', 'فرن'],
  },
  microwave: {
    category: 'heat',
    tier: 'basic',
    aliases: ['microwave oven', 'microondas', 'מיקרוגל', 'микроволновка', 'микроволновая печь', 'свч', 'ميكروويف', 'مايكرويف'],
  },
  toaster: {
    category: 'heat',
    tier: 'special',
    aliases: ['tostadora', 'tostador', 'טוסטר', 'тостер', 'محمصة', 'توستر'],
  },
  grill: {
    category: 'heat',
    tier: 'special',
    aliases: ['barbecue', 'bbq', 'grill pan', 'charcoal grill', 'parrilla', 'barbacoa', 'גריל', 'מנגל', 'гриль', 'мангал', 'барбекю', 'شواية', 'مشواة'],
  },
  air_fryer: {
    category: 'heat',
    tier: 'special',
    aliases: ['airfryer', 'freidora de aire', 'סיר טיגון באוויר', 'אייר פרייר', 'аэрогриль', 'аэрофритюрница', 'قلاية هوائية', 'مقلاة هوائية'],
  },
  deep_fryer: {
    category: 'heat',
    tier: 'special',
    aliases: ['fryer', 'deep fat fryer', 'freidora', 'מטגנת', 'фритюрница', 'قلاية عميقة', 'مقلاة عميقة'],
  },
  // slow and pressure
  slow_cooker: {
    category: 'slow_pressure',
    tier: 'special',
    aliases: ['crock pot', 'crockpot', 'olla de cocción lenta', 'סיר בישול איטי', 'סלואו קוקר', 'медленноварка', 'слоукер', 'طباخ بطيء', 'قدر الطهي البطيء'],
  },
  pressure_cooker: {
    category: 'slow_pressure',
    tier: 'special',
    aliases: ['instant pot', 'instapot', 'multicooker', 'multi cooker', 'olla a presión', 'olla exprés', 'סיר לחץ', 'скороварка', 'мультиварка', 'قدر ضغط', 'حلة ضغط'],
  },
  rice_cooker: {
    category: 'slow_pressure',
    tier: 'special',
    aliases: ['arrocera', 'סיר אורז', 'מבשל אורז', 'рисоварка', 'طباخ أرز', 'حلة أرز'],
  },
  sous_vide: {
    category: 'slow_pressure',
    tier: 'special',
    aliases: ['immersion circulator', 'anova', 'roner', 'סו ויד', 'су вид', 'сувид', 'سو فيد'],
  },
  // blend and mix
  blender: {
    category: 'blend_mix',
    tier: 'special',
    aliases: ['countertop blender', 'vitamix', 'nutribullet', 'licuadora', 'batidora de vaso', 'בלנדר', 'блендер', 'стационарный блендер', 'خلاط'],
  },
  immersion_blender: {
    category: 'blend_mix',
    tier: 'special',
    aliases: ['stick blender', 'hand blender', 'wand blender', 'batidora de mano', 'minipimer', 'batidora de inmersión', 'בלנדר מוט', 'בלנדר ידני', 'погружной блендер', 'ручной блендер', 'خلاط يدوي', 'خلاط غاطس'],
  },
  food_processor: {
    category: 'blend_mix',
    tier: 'special',
    aliases: ['cuisinart', 'magimix', 'procesador de alimentos', 'procesadora', 'robot de cocina', 'מעבד מזון', 'кухонный комбайн', 'измельчитель', 'محضرة طعام', 'محضر طعام'],
  },
  stand_mixer: {
    category: 'blend_mix',
    tier: 'special',
    aliases: ['kitchenaid', 'kitchen aid', 'kenwood chef', 'batidora de pie', 'amasadora', 'batidora planetaria', 'מיקסר', 'מיקסר עומד', 'планетарный миксер', 'стационарный миксер', 'عجانة'],
  },
  hand_mixer: {
    category: 'blend_mix',
    tier: 'special',
    aliases: ['electric mixer', 'electric whisk', 'electric beaters', 'batidora de varillas', 'batidora eléctrica de mano', 'מיקסר ידני', 'מטרפה חשמלית', 'ручной миксер', 'миксер', 'مضرب كهربائي', 'خفاقة كهربائية'],
  },
  spice_grinder: {
    category: 'blend_mix',
    tier: 'special',
    aliases: ['coffee grinder', 'spice mill', 'molinillo de especias', 'molinillo de café', 'מטחנת תבלינים', 'מטחנת קפה', 'кофемолка', 'мельница для специй', 'مطحنة توابل', 'مطحنة قهوة'],
  },
  // tools that change the result
  mortar_and_pestle: {
    category: 'tools',
    tier: 'special',
    aliases: ['mortar pestle', 'mortar', 'pestle', 'molcajete', 'mortero', 'מכתש', 'מכתש ועלי', 'ступка', 'ступка и пестик', 'هاون', 'هاون ومدقة'],
  },
  kitchen_thermometer: {
    category: 'tools',
    tier: 'special',
    aliases: ['thermometer', 'meat thermometer', 'instant read thermometer', 'probe thermometer', 'candy thermometer', 'termómetro', 'termómetro de cocina', 'מדחום', 'מדחום בשר', 'термометр', 'термощуп', 'ميزان حرارة', 'ترمومتر'],
  },
  kitchen_scale: {
    category: 'tools',
    tier: 'special',
    aliases: ['scale', 'scales', 'digital scale', 'báscula', 'báscula de cocina', 'balanza', 'משקל', 'משקל מטבח', 'весы', 'кухонные весы', 'ميزان', 'ميزان مطبخ'],
  },
  zester: {
    category: 'tools',
    tier: 'special',
    aliases: ['microplane', 'fine grater', 'rasp grater', 'rallador fino', 'פומפייה דקה', 'מיקרופליין', 'цестер', 'مبشرة ناعمة'],
  },
  mandoline: {
    category: 'tools',
    tier: 'special',
    aliases: ['mandolin', 'mandoline slicer', 'mandolina', 'מנדולינה', 'мандолина', 'овощерезка', 'ماندولين', 'قطاعة خضار'],
  },
  cast_iron_pan: {
    category: 'tools',
    tier: 'special',
    aliases: ['cast iron skillet', 'cast iron', 'sartén de hierro fundido', 'sartén de hierro', 'מחבת ברזל יצוק', 'מחבת יצוקה', 'чугунная сковорода', 'чугунная сковородка', 'مقلاة حديد زهر', 'مقلاة حديد'],
  },
  dutch_oven: {
    category: 'tools',
    tier: 'special',
    aliases: ['cocotte', 'french oven', 'le creuset', 'olla de hierro fundido', 'סיר ברזל יצוק', 'סיר יצוק', 'чугунная кастрюля', 'قدر حديد زهر', 'طنجرة حديد'],
  },
  wok: {
    category: 'tools',
    tier: 'special',
    aliases: ['ווק', 'вок', 'сковорода вок', 'ووك', 'مقلاة ووك'],
  },
  springform_pan: {
    category: 'tools',
    tier: 'special',
    aliases: ['springform', 'springform tin', 'cheesecake pan', 'molde desmontable', 'molde de aro', 'תבנית קפיצית', 'קפיצית', 'разъёмная форма', 'разъемная форма', 'قالب قابل للفك'],
  },
  pizza_stone: {
    category: 'tools',
    tier: 'special',
    aliases: ['baking stone', 'pizza steel', 'piedra para pizza', 'piedra de hornear', 'אבן פיצה', 'אבן אפייה', 'камень для пиццы', 'камень для выпечки', 'حجر بيتزا', 'حجر الخبز'],
  },
  // specialist machines
  ice_cream_maker: {
    category: 'specialist',
    tier: 'special',
    aliases: ['ice cream machine', 'heladera', 'máquina de helados', 'מכונת גלידה', 'мороженица', 'آلة آيس كريم', 'صانعة الآيس كريم'],
  },
  waffle_maker: {
    category: 'specialist',
    tier: 'special',
    aliases: ['waffle iron', 'gofrera', 'wafflera', 'מכונת וופלים', 'מכשיר וופל', 'вафельница', 'آلة وافل', 'صانعة الوافل'],
  },
  juicer: {
    category: 'specialist',
    tier: 'special',
    aliases: ['juice extractor', 'extractor de jugo', 'מסחטה', 'מסחטת מיצים', 'соковыжималка', 'عصارة'],
  },
  dehydrator: {
    category: 'specialist',
    tier: 'special',
    aliases: ['food dehydrator', 'deshidratador', 'מייבש מזון', 'дегидратор', 'сушилка для овощей', 'مجفف طعام'],
  },
  smoker: {
    category: 'specialist',
    tier: 'special',
    aliases: ['smokehouse', 'pellet smoker', 'offset smoker', 'ahumador', 'מעשנה', 'коптильня', 'مدخن طعام', 'جهاز تدخين'],
  },
} as const satisfies Record<string, CatalogEntry>;

export type ApplianceKey = keyof typeof APPLIANCE_CATALOG;

export const APPLIANCE_KEYS = Object.keys(APPLIANCE_CATALOG) as ApplianceKey[];

/** Why an optional appliance is worth using. Rendered through t(), never free text. */
export const BENEFIT_KEYS = [
  'richer_flavor',
  'smoother_texture',
  'juicier_meat',
  'crispier',
  'more_precise',
  'faster',
  'less_effort',
  'even_cooking',
] as const;
export type BenefitKey = (typeof BENEFIT_KEYS)[number];

/** Workarounds that are not themselves appliances. */
export const ALTERNATIVE_KEYS = ['by_hand', 'pre_ground', 'cut_to_check'] as const;
export type AlternativeKey = (typeof ALTERNATIVE_KEYS)[number];

/** `source` = the recipe names or clearly implies it. `tip` = suggested by Pinch (ADR 017 decision 5). */
export type ApplianceOrigin = 'source' | 'tip';

export interface RecipeAppliance {
  key: ApplianceKey;
  required: boolean;
  /** Optional items only. */
  benefit?: BenefitKey;
  alternative?: ApplianceKey | AlternativeKey;
  /** Instruction step numbers that use it, ascending. Never empty. */
  steps: number[];
  origin: ApplianceOrigin;
}

export const MAX_RECIPE_APPLIANCES = 12;
export const MAX_PINCH_TIPS = 2;
const MAX_STEPS_PER_APPLIANCE = 20;

const KEY_ORDER = new Map(APPLIANCE_KEYS.map((key, index) => [key, index]));
const BENEFITS = new Set<string>(BENEFIT_KEYS);
const ALTERNATIVES = new Set<string>(ALTERNATIVE_KEYS);

export function isApplianceKey(value: unknown): value is ApplianceKey {
  return typeof value === 'string' && Object.prototype.hasOwnProperty.call(APPLIANCE_CATALOG, value);
}

export function isSpecialAppliance(key: ApplianceKey): boolean {
  return APPLIANCE_CATALOG[key].tier === 'special';
}

/**
 * Lowercases, strips accents, Hebrew points and Arabic diacritics, and turns punctuation into spaces,
 * so "Fogón", "Mortar & Pestle" and "air-fryer" match catalog aliases.
 */
export function normalizeApplianceName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇً-ٰٟ]/g, '')
    .toLowerCase()
    .replace(/[-_.,'’&/()]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

let aliasIndex: Map<string, ApplianceKey> | null = null;

function getAliasIndex(): Map<string, ApplianceKey> {
  if (aliasIndex) return aliasIndex;
  const index = new Map<string, ApplianceKey>();
  for (const key of APPLIANCE_KEYS) {
    index.set(normalizeApplianceName(key), key);
    for (const alias of APPLIANCE_CATALOG[key].aliases) {
      index.set(normalizeApplianceName(alias), key);
    }
  }
  aliasIndex = index;
  return index;
}

/** Maps a free-text appliance name (any supported language) to a catalog key, or null if unknown. */
export function resolveApplianceKey(name: unknown): ApplianceKey | null {
  if (typeof name !== 'string') return null;
  const normalized = normalizeApplianceName(name);
  if (!normalized) return null;
  return getAliasIndex().get(normalized) ?? null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function sanitizeSteps(value: unknown, validSteps: ReadonlySet<number>): number[] {
  if (!Array.isArray(value)) return [];
  const steps = value.filter((step): step is number => Number.isInteger(step) && validSteps.has(step));
  return [...new Set(steps)].sort((a, b) => a - b).slice(0, MAX_STEPS_PER_APPLIANCE);
}

function sanitizeItem(raw: unknown, validSteps: ReadonlySet<number>): RecipeAppliance | null {
  if (!isRecord(raw)) return null;
  const { key, required, benefit, alternative, origin } = raw;
  if (!isApplianceKey(key) || typeof required !== 'boolean') return null;
  if (origin !== undefined && origin !== 'source' && origin !== 'tip') return null;
  // Tips are suggestions, so they can never be required.
  if (origin === 'tip' && required) return null;

  // Grounding: an appliance must point at a real step, otherwise it may be invented.
  const steps = sanitizeSteps(raw.steps, validSteps);
  if (steps.length === 0) return null;

  const item: RecipeAppliance = { key, required, steps, origin: origin === 'tip' ? 'tip' : 'source' };
  if (!required && typeof benefit === 'string' && BENEFITS.has(benefit)) {
    item.benefit = benefit as BenefitKey;
  }
  if (alternative !== key && (isApplianceKey(alternative) || (typeof alternative === 'string' && ALTERNATIVES.has(alternative)))) {
    item.alternative = alternative as ApplianceKey | AlternativeKey;
  }
  return item;
}

/** The same key listed twice: keep the strongest claim (required, from the source) and both step lists. */
function mergeItems(a: RecipeAppliance, b: RecipeAppliance): RecipeAppliance {
  const required = a.required || b.required;
  const merged: RecipeAppliance = {
    key: a.key,
    required,
    steps: sanitizeSteps([...a.steps, ...b.steps], new Set([...a.steps, ...b.steps])),
    origin: a.origin === 'source' || b.origin === 'source' ? 'source' : 'tip',
  };
  const benefit = a.benefit ?? b.benefit;
  if (!required && benefit) merged.benefit = benefit;
  const alternative = a.alternative ?? b.alternative;
  if (alternative) merged.alternative = alternative;
  return merged;
}

/** Required first, then by the first step that uses it, then catalog order. */
function compareAppliances(a: RecipeAppliance, b: RecipeAppliance): number {
  if (a.required !== b.required) return a.required ? -1 : 1;
  if (a.steps[0] !== b.steps[0]) return a.steps[0] - b.steps[0];
  return (KEY_ORDER.get(a.key) ?? 0) - (KEY_ORDER.get(b.key) ?? 0);
}

export type SanitizeAppliancesOptions = {
  /** False drops every `tip` item. Defaults to true so stored tips survive a read. */
  allowTips?: boolean;
};

/**
 * Cleans an appliance list from the database or a model.
 *
 * Returns null ("not analysed", show nothing) when the value is not an array, when the recipe has no
 * steps to ground appliances in, or when every item given was invalid. Returns [] only when the
 * input itself was an empty list ("analysed, needs nothing"). Never throws and never mutates the input.
 */
export function sanitizeRecipeAppliances(
  value: unknown,
  stepNumbers: Iterable<number>,
  options: SanitizeAppliancesOptions = {},
): RecipeAppliance[] | null {
  if (!Array.isArray(value)) return null;
  const validSteps = new Set([...stepNumbers].filter((step) => Number.isInteger(step) && step > 0));
  if (validSteps.size === 0) return null;
  if (value.length === 0) return [];

  const allowTips = options.allowTips ?? true;
  const byKey = new Map<ApplianceKey, RecipeAppliance>();
  for (const raw of value) {
    const item = sanitizeItem(raw, validSteps);
    if (!item || (item.origin === 'tip' && !allowTips)) continue;
    const existing = byKey.get(item.key);
    byKey.set(item.key, existing ? mergeItems(existing, item) : item);
  }

  const result: RecipeAppliance[] = [];
  let tips = 0;
  for (const item of [...byKey.values()].sort(compareAppliances)) {
    if (item.origin === 'tip') {
      if (tips === MAX_PINCH_TIPS) continue;
      tips += 1;
    }
    result.push(item);
    if (result.length === MAX_RECIPE_APPLIANCES) break;
  }
  // Something was claimed but nothing survived: we don't know, so don't say "needs nothing".
  return result.length > 0 ? result : null;
}
