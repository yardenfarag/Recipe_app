/**
 * Does a message read like a recipe? Word lists in English, Hebrew, Spanish, Russian and Arabic, matched on
 * normalised tokens (lower case, no accents or Arabic diacritics, one alef). A word ending in `*` matches as a
 * stem ("bake*" → baked, bakery). Hebrew tokens are also tried without their one-letter prefixes (ו, ה, ב, ל, מ,
 * ש, כ) and Arabic ones without ال / و / ب / ل / ف, so "והקמח" finds "קמח" and "والسكر" finds "سكر".
 *
 * This is a cheap first pass on the device. The cook reviews the list, and extraction decides for real.
 */

const UNITS = [
  // English
  'g', 'gr', 'gram', 'grams', 'kg', 'kilo', 'kilos', 'mg', 'ml', 'l', 'liter', 'liters', 'litre', 'litres',
  'cup', 'cups', 'c', 'tbsp', 'tbsps', 'tbs', 'tbl', 'tsp', 'tsps', 'tablespoon*', 'teaspoon*', 'oz', 'ounce*', 'lb', 'lbs', 'pound*', 'pinch', 'pinches',
  'dash', 'clove', 'cloves', 'cans', 'pkg', 'package*', 'packet*', 'stick', 'sticks', 'slice*', 'handful*',
  'bunch', 'sprig*', 'quart', 'quarts', 'pint', 'pints',
  // Spanish
  'taza*', 'cucharad*', 'cda', 'cdas', 'cdta', 'cdtas', 'gramo*', 'litro*', 'pizca*', 'diente*', 'lata', 'latas',
  'paquete*', 'rebanada*', 'punado*', 'chorrito*',
  // Russian
  'г', 'гр', 'грамм*', 'кг', 'мл', 'л', 'литр*', 'стакан*', 'ложк*', 'ст', 'ч', 'щепот*', 'шт', 'штук*', 'зубч*',
  'пачк*', 'банка', 'банки', 'банку', 'упаковк*', 'пучок', 'пучк*',
  // Hebrew
  'כוס', 'כוסות', 'כף', 'כפות', 'כפית', 'כפיות', 'גרם', 'גר', 'ק"ג', 'קג', 'קילו', 'מ"ל', 'מל', 'ליטר', 'קורט',
  'חבילה', 'חבילות', "יח'", 'יח', 'יחידות', 'שן', 'שיני', 'שקית', 'שקיות', 'קופסה', 'קופסת', 'פרוסה', 'פרוסות',
  'חופן', 'צרור',
  // Arabic
  'كوب', 'اكواب', 'كاس', 'ملعقة', 'ملاعق', 'معلقة', 'غرام', 'غ', 'جرام', 'جم', 'غم', 'كغ', 'كيلو', 'مل', 'لتر',
  'رشة', 'حبة', 'حبات', 'حبه', 'فص', 'فصوص', 'علبة', 'علب', 'كيس', 'شريحة', 'شرائح', 'حفنة', 'باقة',
];

const INGREDIENTS = [
  // English
  'flour', 'sugar', 'egg', 'eggs', 'butter', 'salt', 'pepper', 'oil', 'olive', 'milk', 'cream', 'onion*', 'garlic',
  'water', 'yeast', 'vanilla', 'cinnamon', 'honey', 'lemon*', 'tomato*', 'potato*', 'chicken', 'beef', 'rice',
  'cheese', 'chocolate', 'powder', 'soda', 'parsley', 'cilantro', 'cumin', 'paprika', 'carrot*', 'yogurt',
  'yoghurt', 'broth', 'lime', 'ginger', 'cocoa', 'oats', 'nuts', 'almond*', 'walnut*', 'zucchini', 'eggplant*',
  // Spanish
  'harina', 'azucar', 'huevo*', 'mantequilla', 'sal', 'pimienta', 'aceite', 'leche', 'nata', 'crema', 'cebolla*',
  'ajo', 'ajos', 'agua', 'levadura', 'vainilla', 'canela', 'miel', 'limon*', 'tomate*', 'patata*',
  'pollo', 'carne', 'arroz', 'queso', 'perejil', 'comino', 'zanahoria*', 'yogur*', 'cacao', 'almendra*',
  // Russian (й and ё are normalised to и and е)
  'мук*', 'сахар*', 'яиц*', 'яица', 'яицо', 'масл*', 'соль', 'соли', 'солью', 'перец', 'перц*', 'молок*', 'сливк*',
  'лук', 'лука', 'луковиц*', 'чеснок*', 'вода', 'воды', 'воду', 'водои', 'дрожж*', 'ванил*', 'корица', 'корицы',
  'мед', 'меда', 'лимон*', 'помидор*', 'томат*', 'картоф*', 'картош*', 'курин*', 'куриц*', 'говядин*', 'рис', 'риса',
  'сыр', 'сыра', 'шоколад*', 'петрушк*', 'укроп*', 'морков*', 'иогурт*', 'сметан*', 'творог*', 'какао',
  // Hebrew
  'קמח', 'סוכר', 'ביצה', 'ביצים', 'חמאה', 'מלח', 'פלפל', 'שמן', 'חלב', 'שמנת', 'בצל', 'בצלים', 'מים',
  'שמרים', 'וניל', 'קינמון', 'דבש', 'לימון', 'עגבני*', 'תפוחי', 'תפו"א', 'עוף', 'בשר', 'אורז', 'גבינה', 'גבינת',
  'שוקולד', 'אבקת', 'סודה', 'פטרוזיליה', 'כוסברה', 'כמון', 'פפריקה', 'גזר', 'יוגורט', 'טחינה', 'קקאו', 'שקדים',
  'אגוזי', 'קישוא*', 'חציל*', 'מרגרינה',
  // Arabic (alef forms are normalised to ا)
  'طحين', 'دقيق', 'سكر', 'بيض', 'بيضة', 'بيضات', 'زبدة', 'ملح', 'فلفل', 'زيت', 'حليب', 'قشطة', 'كريمة', 'بصل',
  'ثوم', 'ماء', 'خميرة', 'فانيليا', 'قرفة', 'عسل', 'ليمون', 'طماطم', 'بندورة', 'بطاطا', 'بطاطس', 'دجاج', 'لحم',
  'رز', 'ارز', 'جبن', 'جبنة', 'شوكولاتة', 'شوكولا', 'بقدونس', 'كزبرة', 'كمون', 'بابريكا', 'جزر', 'لبن', 'زبادي',
  'طحينة', 'كاكاو', 'لوز', 'باذنجان', 'كوسا',
];

const METHOD = [
  // English
  'mix', 'mixed', 'mixing', 'mixture', 'stir*', 'bake', 'baked', 'baking', 'preheat*', 'oven', 'cook', 'cooked',
  'cooking', 'boil*', 'fry', 'fried', 'frying', 'add', 'added', 'adding', 'combine*', 'whisk*', 'knead*', 'simmer*',
  'saute*', 'chop*', 'dice', 'diced', 'pour*', 'beat', 'sprinkle*', 'serve', 'serving', 'minutes', 'mins', 'roast*',
  'grill*', 'blend*', 'fold', 'melt*', 'season*', 'marinate*', 'refrigerat*', 'degrees', 'heat', 'heated', 'until',
  // Spanish
  'mezcl*', 'revuelv*', 'remov*', 'hornea*', 'horno', 'cocin*', 'hierv*', 'herv*', 'freir', 'frie*', 'anad*',
  'agreg*', 'incorpor*', 'batir', 'bate', 'batimos', 'amasa*', 'picar', 'vierte', 'verter', 'vierta', 'sirve', 'servir',
  'minutos', 'calent*', 'precalent*', 'derret*', 'dora', 'dorar', 'sofri*', 'saltea*', 'grados',
  // Russian
  'смеша*', 'перемеша*', 'мешать', 'выпека*', 'запека*', 'духовк*', 'варит*', 'свари*', 'отвари*', 'обжар*', 'жарить',
  'обжарить', 'добав*', 'взби*', 'замес*', 'нареза*', 'нарез*', 'выли*', 'подава*', 'минут*', 'разогре*', 'нагре*',
  'растоп*', 'туши*', 'остуди*', 'выпекать', 'градус*',
  // Hebrew
  'מערבב*', 'לערבב', 'ערבב*', 'אופים', 'לאפות', 'אפייה', 'אפיה', 'תנור', 'מחממים', 'לחמם', 'חימום', 'מוסיפים',
  'להוסיף', 'הוסיפו', 'מבשלים', 'לבשל', 'בישול', 'מטגנים', 'לטגן', 'מקציפים', 'להקציף', 'מרתיחים',
  'להרתיח', 'קוצצים', 'לקצוץ', 'חותכים', 'לחתוך', 'יוצקים', 'שופכים', 'מגישים', 'להגיש', 'דקות', 'מעלות',
  'מקררים', 'לקרר', 'ממיסים', 'להמיס', 'מפזרים', 'מניחים', 'מרסקים', 'טוחנים', 'צולים', 'מתבלים', 'משמנים',
  // Arabic
  'اخلط*', 'نخلط', 'يخلط', 'خلط*', 'حرك*', 'اخبز*', 'نخبز', 'يخبز', 'فرن', 'سخن*', 'اضف*', 'اضيف*', 'نضيف', 'يضاف',
  'اطبخ*', 'نطبخ', 'يطبخ', 'اغلي', 'نغلي', 'غلي*', 'اقلي', 'نقلي', 'قلي*', 'اخفق*', 'نخفق', 'خفق*', 'اعجن*', 'نعجن',
  'عجن*', 'قطع*', 'اسكب*', 'نسكب', 'دقائق', 'دقيقة', 'درجة', 'حمر*', 'ذوب*', 'يقدم', 'قدمي', 'نقدم',
];

const RECIPE_WORDS = [
  'recipe*', 'recette*', 'receta*', 'rezept*', 'ricetta*', 'ricette', 'рецепт*', 'מתכון', 'מתכונים', 'מתכוני',
  'وصفة', 'وصفات', 'وصفه', 'homemade', 'casera', 'casero', 'ingredients', 'ingredientes', 'ингредиент*',
  'מצרכים', 'مكونات', 'مقادير',
];

const DISHES = [
  // English
  'cake*', 'cookie*', 'bread*', 'soup*', 'salad*', 'pasta', 'pie', 'pies', 'muffin*', 'pancake*', 'brownie*',
  'stew*', 'curry', 'lasagna', 'lasagne', 'pizza*', 'quiche', 'tart', 'tarts', 'dessert*', 'sauce*', 'casserole*',
  'risotto', 'noodle*', 'dumpling*', 'shakshuka', 'hummus', 'falafel', 'schnitzel', 'challah', 'cheesecake*', 'biscuit*', 'scone*', 'granola', 'smoothie*', 'meatball*', 'burger*',
  'taco*', 'burrito*', 'omelet*', 'frittata', 'focaccia', 'babka', 'kugel', 'latke*', 'cupcake*', 'waffle*', 'bake*',
  // Spanish
  'pastel*', 'torta*', 'galleta*', 'pan', 'sopa*', 'ensalada*', 'tarta*', 'postre*', 'guiso*', 'empanada*',
  'tortilla*', 'flan', 'bizcocho*', 'croqueta*', 'paella', 'albondiga*',
  // Russian
  'торт*', 'пирог*', 'пирож*', 'печень*', 'хлеб*', 'суп', 'супа', 'салат*', 'борщ*', 'блин*', 'олад*', 'котлет*',
  'плов*', 'пельмен*', 'вареник*', 'запеканк*', 'сырник*', 'кекс*', 'десерт*', 'каша', 'кашу', 'рагу', 'соус*',
  'выпечк*',
  // Hebrew
  'עוגה', 'עוגת', 'עוגות', 'עוגיות', 'עוגייה', 'עוגיה', 'לחם', 'חלה', 'חלות', 'מרק', 'סלט', 'פשטידה', 'פאי',
  'קציצות', 'שקשוקה', 'חומוס', 'פלאפל', 'שניצל', 'פסטה', 'תבשיל', 'קינוח', 'מאפה', 'מאפים', 'לביבות', 'סופגניות',
  'בורקס', 'קוגל', 'פיצה', 'רוטב', 'ממולאים', 'מקלובה', "מג'דרה", 'חמין',
  // Arabic
  'كعكة', 'كيكة', 'كيك', 'حلوى', 'حلويات', 'خبز', 'شوربة', 'شوربه', 'سلطة', 'فطيرة', 'فطائر', 'معجنات', 'كبة',
  'محشي', 'مقلوبة', 'منسف', 'مجدرة', 'فلافل', 'حمص', 'صلصة', 'طبخة', 'بسبوسة', 'كنافة', 'معمول',
];

/** Headings that open an ingredient list or a method, matched at the start of a short line. */
const INGREDIENT_HEADINGS = [
  'ingredients', 'ingredient', "you'll need", 'you will need', 'ingredientes', 'ингредиенты', 'продукты',
  'מצרכים', 'המצרכים', 'רכיבים', 'הרכיבים', 'חומרים', 'החומרים', 'المكونات', 'مكونات', 'المقادير', 'مقادير',
];
const METHOD_HEADINGS = [
  'method', 'instructions', 'directions', 'preparation', 'how to make', 'steps', 'preparacion', 'elaboracion',
  'instrucciones', 'pasos', 'modo de preparacion', 'приготовление', 'способ приготовления', 'инструкция',
  'אופן הכנה', 'אופן ההכנה', 'הוראות הכנה', 'ההכנה', 'הכנה', 'طريقة التحضير', 'طريقة العمل', 'الطريقة',
  'التحضير', 'الخطوات', 'طريقة',
];

/** Lower case, digits in ASCII, no accents, no Hebrew points, no Arabic diacritics or tatweel, one alef. */
export function normalizeForMatch(value: string): string {
  let out = value.toLowerCase();
  try {
    out = out.normalize('NFD');
  } catch {
    // Engines without String#normalize keep the accents; matching only gets a little weaker.
  }
  return out
    .replace(/[\u0300-\u036F]/g, '')
    .replace(/\u05BE/g, ' ')
    .replace(/[\u0591-\u05C7]/g, '')
    .replace(/[\u05F4\u201C\u201D]/g, '"')
    .replace(/[\u05F3\u2018\u2019]/g, "'")
    .replace(/[\u064B-\u065F\u0670\u0640]/g, '')
    .replace(/[\u0622\u0623\u0625]/g, '\u0627')
    .replace(/[\u0660-\u0669]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[\u06F0-\u06F9]/g, (d) => String(d.charCodeAt(0) - 0x06f0));
}

const TOKEN = /[a-z\u00DF-\u024F\u0400-\u04FF\u05D0-\u05EA\u0620-\u064A\u0671-\u06D3"']+/g;

export function tokenize(normalized: string): string[] {
  const tokens: string[] = [];
  for (const match of normalized.matchAll(TOKEN)) {
    const token = match[0].replace(/^["']+|["']+$/g, '');
    if (token) tokens.push(token);
  }
  return tokens;
}

/** \u05D5 \u05D4 \u05D1 \u05DC \u05DE \u05E9 \u05DB */
const HEBREW_PREFIX = /^[\u05D5\u05D4\u05D1\u05DC\u05DE\u05E9\u05DB]/;
/** \u0648\u0627\u0644 \u0628\u0627\u0644 \u0641\u0627\u0644 \u0643\u0627\u0644 \u0644\u0644 \u0627\u0644 \u0648 \u0641 \u0628 \u0644, longest first. */
const ARABIC_PREFIXES = [
  '\u0648\u0627\u0644',
  '\u0628\u0627\u0644',
  '\u0641\u0627\u0644',
  '\u0643\u0627\u0644',
  '\u0644\u0644',
  '\u0627\u0644',
  '\u0648',
  '\u0641',
  '\u0628',
  '\u0644',
];

/** The token, and the token without the prefixes Hebrew and Arabic glue onto words. */
function variants(token: string): string[] {
  const first = token.charCodeAt(0);
  if (first >= 0x05d0 && first <= 0x05ea) {
    const out = [token];
    let rest = token;
    for (let i = 0; i < 2 && HEBREW_PREFIX.test(rest) && rest.length > 3; i++) {
      rest = rest.slice(1);
      out.push(rest);
    }
    return out;
  }
  if (first >= 0x0620 && first <= 0x06d3) {
    const out = [token];
    for (const prefix of ARABIC_PREFIXES) {
      if (token.startsWith(prefix) && token.length - prefix.length >= 2) out.push(token.slice(prefix.length));
    }
    return out;
  }
  return [token];
}

class Lexicon {
  private readonly exact = new Set<string>();
  private readonly stems = new Set<string>();
  private minStem = Infinity;
  private maxStem = 0;

  constructor(words: readonly string[]) {
    for (const word of words) {
      if (word.endsWith('*')) {
        const stem = normalizeForMatch(word.slice(0, -1));
        this.stems.add(stem);
        this.minStem = Math.min(this.minStem, stem.length);
        this.maxStem = Math.max(this.maxStem, stem.length);
      } else {
        this.exact.add(normalizeForMatch(word));
      }
    }
  }

  /** The dictionary word the token matches (for counting distinct hits), or null. */
  match(token: string): string | null {
    for (const variant of variants(token)) {
      if (this.exact.has(variant)) return variant;
      const longest = Math.min(this.maxStem, variant.length);
      for (let length = this.minStem; length <= longest; length++) {
        const prefix = variant.slice(0, length);
        if (this.stems.has(prefix)) return prefix;
      }
    }
    return null;
  }
}

const units = new Lexicon(UNITS);
const ingredients = new Lexicon(INGREDIENTS);
const method = new Lexicon(METHOD);
const recipeWords = new Lexicon(RECIPE_WORDS);
const dishes = new Lexicon(DISHES);
const ingredientHeadings = INGREDIENT_HEADINGS.map(normalizeForMatch);
const methodHeadings = METHOD_HEADINGS.map(normalizeForMatch);

const BULLET = /^(?:[-*\u2022\u00B7\u25AA\u25AB\u25E6\u25CF\u25CB\u2713\u2714\u2796\u2013\u2014+]|\d{1,2}[.)]\s)/;
const FRACTION = /[\u00BC-\u00BE\u2150-\u215E]/;
const QUANTITY_PAIR = /(?:\d+(?:[.,/]\d+)?|[\u00BC-\u00BE\u2150-\u215E])\s*-?\s*([^\s\d]+)/g;
const QUANTITY_START =
  /^[-*\u2022\u00B7\u25AA\u25E6\u25CF\u2713\u2714\u2796\u2013\u2014\s]*(?:\d|[\u00BC-\u00BE\u2150-\u215E])/;

export interface RecipeSignals {
  length: number;
  lines: number;
  /** Lines that look like an ingredient: a quantity with a unit, a bullet with an ingredient, "2 eggs"… */
  ingredientLines: number;
  /** Lines with a number and a unit ("200 g", "2 כוסות"). */
  quantityLines: number;
  /** A number right before a unit or an ingredient ("300 ml", "2 eggs"), counted across the whole text. */
  quantityPairs: number;
  methodWords: number;
  ingredientWords: number;
  ingredientHeading: boolean;
  methodHeading: boolean;
  recipeWord: boolean;
  dishWord: boolean;
}

function startsWithHeading(line: string, headings: readonly string[]): boolean {
  if (line.length > 40) return false;
  const bare = line.replace(/^[^a-z\u00DF-\u024F\u0400-\u04FF\u05D0-\u05EA\u0620-\u06D3]+/, '');
  return headings.some((heading) => bare.startsWith(heading));
}

export function analyzeText(text: string): RecipeSignals {
  const normalized = normalizeForMatch(text);
  const lines = normalized
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  const methodSeen = new Set<string>();
  const ingredientSeen = new Set<string>();
  const signals: RecipeSignals = {
    length: text.trim().length,
    lines: lines.length,
    ingredientLines: 0,
    quantityLines: 0,
    quantityPairs: 0,
    methodWords: 0,
    ingredientWords: 0,
    ingredientHeading: false,
    methodHeading: false,
    recipeWord: false,
    dishWord: false,
  };

  for (const line of lines) {
    if (startsWithHeading(line, ingredientHeadings)) signals.ingredientHeading = true;
    if (startsWithHeading(line, methodHeadings)) signals.methodHeading = true;

    let hasUnit = false;
    let hasIngredient = false;
    let lineMethod = false;
    for (const token of tokenize(line)) {
      if (units.match(token)) hasUnit = true;
      const ingredient = ingredients.match(token);
      if (ingredient) {
        hasIngredient = true;
        ingredientSeen.add(ingredient);
      }
      const verb = method.match(token);
      if (verb) {
        lineMethod = true;
        methodSeen.add(verb);
      }
      if (!signals.recipeWord && recipeWords.match(token)) signals.recipeWord = true;
      if (!signals.dishWord && dishes.match(token)) signals.dishWord = true;
    }

    const hasNumber = /\d/.test(line) || FRACTION.test(line);
    if (hasNumber && hasUnit) signals.quantityLines++;
    if (line.length > 80) continue;
    const quantityFirst = QUANTITY_START.test(line);
    const bullet = BULLET.test(line);
    if (
      (hasNumber && hasUnit) ||
      (quantityFirst && hasIngredient) ||
      (bullet && (hasUnit || hasIngredient)) ||
      (line.length <= 40 && hasIngredient && !lineMethod)
    ) {
      signals.ingredientLines++;
    }
  }

  for (const match of normalized.matchAll(QUANTITY_PAIR)) {
    const word = tokenize(match[1])[0];
    if (word && (units.match(word) || ingredients.match(word))) signals.quantityPairs++;
  }
  signals.methodWords = methodSeen.size;
  signals.ingredientWords = ingredientSeen.size;
  return signals;
}

export type RecipeShape = 'strong' | 'weak' | null;

/**
 * 'strong': a written recipe (an ingredient list and a method, or a prose recipe full of quantities).
 * 'weak': recipe-ish, shown unticked. null: chit-chat.
 */
export function recipeShape(text: string): RecipeShape {
  if (text.trim().length < 100) return null;
  const s = analyzeText(text);
  const hasMethod = s.methodWords >= 1 || s.methodHeading;
  if (s.length >= 120) {
    if (s.ingredientLines >= 3 && s.lines >= 4 && hasMethod) return 'strong';
    if (s.ingredientHeading && (s.ingredientLines >= 2 || s.ingredientWords >= 3) && hasMethod) return 'strong';
    if (s.quantityPairs >= 3 && s.methodWords >= 2 && s.ingredientWords >= 3) return 'strong';
  }
  if (s.ingredientLines >= 2 && hasMethod && s.ingredientWords >= 2) return 'weak';
  if ((s.ingredientHeading || s.methodHeading) && s.ingredientWords >= 2) return 'weak';
  if (s.methodWords >= 2 && s.ingredientWords >= 3 && s.quantityPairs >= 1) return 'weak';
  return null;
}

/** A photo caption or a link's message that talks about food or a recipe. */
export function looksFoodRelated(text: string): boolean {
  if (!text.trim()) return false;
  const s = analyzeText(text);
  return (
    s.recipeWord ||
    s.dishWord ||
    s.ingredientWords >= 2 ||
    (s.ingredientWords >= 1 && s.methodWords >= 1) ||
    s.methodWords >= 2 ||
    s.ingredientLines >= 2
  );
}

const RECIPE_HOST = /recip|recet|rezept|ricett|recette|cook|kitchen|kitchn|food|bake|baking|chef|cuisine|cocina|matkon/;

/** Words in a web link's host or path ("/recipes/chocolate-cake") that point at a recipe page. */
export function urlLooksLikeRecipe(host: string, path: string): boolean {
  if (RECIPE_HOST.test(host)) return true;
  let decoded = path;
  try {
    decoded = decodeURIComponent(path);
  } catch {
    // Keep the raw path.
  }
  for (const token of tokenize(normalizeForMatch(decoded.replace(/[-_/.+]/g, ' ')))) {
    if (recipeWords.match(token) || dishes.match(token) || ingredients.match(token)) return true;
  }
  return false;
}
