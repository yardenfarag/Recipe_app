/**
 * The avoid list (PIN-105): allergies and foods a cook does not like, and the matcher that finds
 * them in a recipe's ingredient names.
 *
 * Matching runs on the device against the ingredients on screen, so it stays right after a swap,
 * an edit, a remix or a translation. It reads English, Hebrew, Spanish, Russian and Arabic names.
 * It can miss an ingredient, so the app never calls a recipe "safe": no match shows nothing.
 */

export const ALLERGEN_KEYS = [
  'milk',
  'eggs',
  'fish',
  'shellfish',
  'tree_nuts',
  'peanuts',
  'gluten',
  'soy',
  'sesame',
] as const;

export type AllergenKey = (typeof ALLERGEN_KEYS)[number];

/** Dislikes offered as one-tap chips. Each one has a word list, so it matches in any app language. */
export const DISLIKE_SUGGESTION_KEYS = [
  'cilantro',
  'mushrooms',
  'olives',
  'onion',
  'garlic',
  'eggplant',
  'tomato',
  'chili',
  'coconut',
  'pork',
] as const;

export type DislikeSuggestionKey = (typeof DISLIKE_SUGGESTION_KEYS)[number];

export const MAX_OTHER_ALLERGIES = 5;
export const MAX_DISLIKES = 12;
export const MAX_AVOID_ITEM_CHARS = 30;
/** transform-recipe keeps the first 400 characters of an instruction. */
export const MAX_AVOID_INSTRUCTION_CHARS = 400;

export type AvoidList = {
  allergies: AllergenKey[];
  /** Allergies the cook typed in, outside the fixed list. */
  otherAllergies: string[];
  dislikes: string[];
};

export type AvoidHit = {
  /** The typed item, or the allergen key when `allergen` is set. */
  item: string;
  allergen?: AllergenKey;
  /** Ingredient names that matched, as written in the recipe. */
  ingredients: string[];
};

export type AvoidMatches = {
  allergies: AvoidHit[];
  dislikes: AvoidHit[];
  /** One entry per ingredient, in order. An allergy wins over a dislike. */
  byIngredient: ('allergy' | 'dislike' | null)[];
};

const ALLERGEN_KEY_SET = new Set<string>(ALLERGEN_KEYS);

export function isAllergenKey(value: unknown): value is AllergenKey {
  return typeof value === 'string' && ALLERGEN_KEY_SET.has(value);
}

/** Lower case, no accents or vowel marks, punctuation as spaces. */
export function normalizeFoodText(value: string): string {
  return value
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-֑ͯ-ׇً-ٰٟـ]/g, '')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

/** Trims a typed item to one short line. */
export function cleanAvoidItem(value: unknown): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\s+/g, ' ').trim().slice(0, MAX_AVOID_ITEM_CHARS).trim();
}

/** Cleans a typed list: no blanks, no repeats (ignoring case and accents), at most `max`. */
export function cleanAvoidItems(value: unknown, max: number): string[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<string>();
  const items: string[] = [];
  for (const raw of value) {
    const item = cleanAvoidItem(raw);
    const key = normalizeFoodText(item);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    items.push(item);
    if (items.length >= max) break;
  }
  return items;
}

export function avoidListIsEmpty(list: AvoidList): boolean {
  return list.allergies.length === 0 && list.otherAllergies.length === 0 && list.dislikes.length === 0;
}

export function hasAllergies(list: AvoidList): boolean {
  return list.allergies.length > 0 || list.otherAllergies.length > 0;
}

// ---------------------------------------------------------------------------------------------
// Word lists
//
// Each entry is a word or a phrase. A trailing * matches any ending ("молок*" matches "молока").
// Latin words also match their plural. `unless` phrases cancel a match on the same words
// ("peanut butter" is not milk). A `free` phrase cancels the whole ingredient ("gluten-free flour").
// Arabic words are written without "ال".
// ---------------------------------------------------------------------------------------------

type RawDictionary = { terms: string; unless?: string; free?: string };

const NON_WHEAT_FLOURS_EN =
  'almond, rice, corn, coconut, chickpea, tapioca, potato, cassava, buckwheat, quinoa, sorghum, millet, teff, gram, soy, lentil, banana, arrowroot, hazelnut, plantain';

function each(list: string, build: (item: string) => string): string {
  return list
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean)
    .map(build)
    .join(', ');
}

const ALLERGEN_WORDS: Record<AllergenKey, RawDictionary> = {
  milk: {
    terms: `
      milk, dairy, buttermilk, butter, ghee, cream, creme fraiche, cheese, cheddar, mozzarella, parmesan,
      parmigiano, pecorino, feta, ricotta, mascarpone, gouda, gruyere, brie, camembert, halloumi,
      paneer, burrata, provolone, emmental, gorgonzola, cotija, yogurt, yoghurt, kefir, whey, casein,
      custard, labneh, half and half, quark, curd, white chocolate, nutella, bechamel, alfredo, gelato,
      חלב, חמאה, שמנת, גבינ*, יוגורט, קוטג', מוצרלה, פרמזן, פטה, ריקוטה, מסקרפונה, צ'דר, חלומי,
      גאודה, קשקבל, גהי, גליד*, קצפת, לאבנה, שוקולד לבן,
      leche, mantequilla, nata, crema, queso, yogur, requeson, parmesano, cuajada,
      молок*, молочн*, сливк*, сливок, сливочн*, сметан*, сыр, сыра, сыром, сыре, сыры, сыров, сыру,
      творог*, творож*, йогурт*, кефир*, пармезан*, моцарелл*, фета, феты, фету, рикотт*,
      маскарпоне, брынз*, сгущенк*, пахт*, ряженк*, топлен* масл*, гхи, мороженое, мороженого,
      сыворотк*,
      чеддер*, халуми, сулугуни,
      حليب, لبن, زبدة, قشطة, كريمة, كريما, جبن, جبنة, اجبان, البان, زبادي, روب, لبنة, سمن, سمنة,
      موزاريلا, بارميزان, شيدر, فيتا, ريكوتا, ماسكاربوني, حلوم, ايس كريم, بوظة, قيمر
    `,
    unless: `
      coconut milk, almond milk, oat milk, soy milk, soya milk, rice milk, cashew milk, hazelnut milk,
      nut milk, hemp milk, pea milk, plant milk, coconut cream, cashew cream, oat cream, soy cream,
      cream of coconut, creamed coconut, coconut butter, peanut butter, almond butter, cashew butter,
      hazelnut butter, nut butter, seed butter, pistachio butter, pecan butter, walnut butter,
      sesame butter, cocoa butter, cacao butter, shea butter, apple butter, pumpkin butter,
      butter bean, butter lettuce, cream of tartar, coconut yogurt, soy yogurt, almond yogurt,
      cashew cheese, bean curd,
      חלב קוקוס, חלב שקדים, חלב סויה, חלב שיבולת שועל, חלב אורז, חלב קשיו, חלב אגוזים, חלב צמחי,
      שמנת קוקוס, שמנת סויה, שמנת צמחית, שמנת שיבולת שועל, שמנת קשיו, גבינת קשיו, גבינה צמחית,
      חמאה צמחית, יוגורט קוקוס, יוגורט סויה,
      leche de coco, leche de almendra, leche de avena, leche de soja, leche de soya, leche de arroz,
      leche de anacardo, leche vegetal, nata vegetal, crema vegetal, mantequilla vegetal,
      queso vegetal, crema de coco, crema de cacahuete, crema de cacahuate, crema de mani,
      crema de almendra, crema de cacao, crema de avellana, crema de sesamo, crema balsamica,
      crema de vinagre, mantequilla de cacahuete, mantequilla de cacahuate, mantequilla de mani,
      mantequilla de almendra, mantequilla de cacao, mantequilla de anacardo,
      кокосов* молок*, миндальн* молок*, овсян* молок*, соев* молок*, рисов* молок*,
      орехов* молок*, растительн* молок*, кокосов* сливк*, соев* сливк*, растительн* сливк*,
      растительн* сыр*, кокосов* йогурт*,
      حليب جوز هند, حليب لوز, حليب شوفان, حليب صويا, حليب ارز, كريمة جوز هند, لبن جوز هند,
      زبدة فول سوداني, زبدة لوز, زبدة كاكاو, زبدة كاجو, زبدة فستق, زبدة بندق, سمن نباتي,
      حليب نباتي, كريمة نباتي*, زبدة نباتي*, جبن نباتي*, جبنة نباتي*
    `,
    free: `
      dairy free, non dairy, nondairy, milk free, vegan, plant based,
      טבעוני*, ללא חלב, נטול חלב, פרווה,
      sin lacteos, sin leche, vegan*,
      веган*, без молока, безмолочн*,
      بدون حليب, خالي من البان
    `,
  },
  eggs: {
    terms: `
      egg, yolk, mayonnaise, mayo, aioli, meringue, albumen, hollandaise, custard, eggnog,
      ביצה, ביצים, ביצת, ביצי, חלמון, חלמונים, חלבון, חלבונים, מיונז, איולי, מרנג,
      huevo, yema, claras, mayonesa, alioli, merengue,
      яйц*, яиц, яичн*, желток, желтка, желтки, желтков, майонез*, меринг*, безе, айоли,
      بيض, بيضة, بيضات, صفار, مايونيز, ايولي
    `,
    unless: `
      egg replacer, egg substitute, flax egg, chia egg,
      אבקת חלבון, חלבון סויה, חלבון אפונה, חלבון מי גבינה
    `,
    free: `
      egg free, eggless, vegan,
      טבעוני*, ללא ביצים,
      sin huevo, vegan*,
      без яиц, веган*,
      بدون بيض, نباتي*
    `,
  },
  fish: {
    terms: `
      fish, salmon, tuna, cod, anchov*, sardine, mackerel, trout, tilapia, halibut, haddock, sea bass,
      seabass, snapper, herring, swordfish, catfish, whitefish, monkfish, mahi, pollock, flounder,
      bonito, dashi, worcestershire, caesar, caviar, roe, surimi, nam pla, lox, eel, unagi, carp,
      perch, grouper, branzino, barramundi, bream, hake, pangasius, basa, tarama, furikake,
      דג, דגים, דגי, סלמון, טונה, אנשובי, סרדין, סרדינים, מקרל, בקלה, דניס, לברק, אמנון, מושט, פורל,
      בורי, לוקוס, הרינג, קוויאר, איקרה, ווסטרשייר, וורצסטרשייר,
      pescado, atun, bacalao, anchoa, boqueron, sardina, caballa, trucha, merluza, lubina, lenguado,
      salsa inglesa,
      рыб*, лосос*, семг*, тунец, тунц*, треск*, анчоус*, сардин*, скумбри*, форел*, сельдь,
      сельди, сельдью,
      селедк*, горбуш*, кета, кеты, кету, судак*, минта*, икр*, хек, палтус*, окун*, карп, щук*,
      вустерск*, вустершир*,
      سمك, سمكة, اسماك, سلمون, تونة, تونا, انشوفة, انشوجة, انشوفي, سردين, ماكريل, هامور, كافيار,
      بلطي, دنيس, فسيخ, رنجة, ورشستر*, وورشستر*, ورسستر*, وورسستر*, ووستر*
    `,
    unless: `
      swedish fish,
      икр* баклажан*, баклажанн* икр*, кабачков* икр*, икр* кабачк*
    `,
    free: `vegan, vegetarian, טבעוני*, vegan*, веган*, نباتي*`,
  },
  shellfish: {
    terms: `
      shellfish, seafood, shrimp, prawn, crab, crabmeat, lobster, crayfish, crawfish, langoustine,
      scampi, krill, clam, mussel, oyster, scallop, squid, calamari, octopus, cuttlefish, snail,
      escargot, abalone, belacan, conch, cockle, whelk, sea urchin,
      שרימפס, שרימפ, חסילון, חסילונים, סרטן, סרטנים, לובסטר, קלמרי, תמנון, צדפה, צדפות, מולים,
      פירות ים, סקאלופ, סקלופ, דיונון, אויסטר,
      marisco, gamba, camaron, langostino, langosta, cangrejo, bogavante, cigala, almeja, mejillon,
      ostra, ostion, vieira, calamar, pulpo, sepia, chipiron, berberecho, caracol, percebe, jaiba,
      кревет*, краб*, омар*, лобстер*, лангуст*, раки, раков, миди*, устри*, гребеш*, кальмар*,
      осьминог*, каракатиц*, моллюск*, морепродукт*, улитк*, вонгол*,
      جمبري, روبيان, قريدس, سلطعون, كابوريا, سرطان, استاكوزا, كركند, محار, بلح بحر, حبار, كاليماري,
      اخطبوط, ثمار بحر, ماكولات بحرية, اسكالوب, جندوفلي, سبيط
    `,
    unless: `oyster mushroom, פטריות צדפה`,
    free: `vegan, vegetarian, טבעוני*, vegan*, веган*, نباتي*`,
  },
  tree_nuts: {
    terms: `
      nut, almond, walnut, pecan, cashew, pistachio, hazelnut, macadamia, pine nut, pinenut, chestnut,
      filbert, marzipan, praline, nutella, gianduja, frangipane, amaretto, pesto, nougat, marcona,
      dukkah, macaron,
      אגוז, אגוזים, אגוזי, שקד, שקדים, קשיו, פיסטוק, פיסטוקים, פקאן, פקאנים, מקדמיה, צנובר, צנוברים,
      מרציפן, נוטלה, פסטו, ערמון, ערמונים, נוגט, פרלין, פרלינה, אמרטו,
      almendra, nuez, nueces, anacardo, castana, pistacho, avellana, pecana, pinon, fruto seco,
      frutos secos, mazapan, turron, maranon,
      орех*, миндал*, фундук*, кешью, фисташ*, пекан*, макадами*, марципан*, пралине, нутелл*,
      песто, каштан*,
      مكسرات, لوز, جوز, عين جمل, كاجو, فستق, بندق, بيكان, صنوبر, مرزبان, نوتيلا, بيستو, كستناء,
      كستنا, مكاديميا
    `,
    unless: `
      water chestnut, tiger nut,
      אגוז מוסקט, אגוז קוקוס, אגוזי אדמה,
      nuez moscada, castana de agua,
      мускатн* орех*, кокосов* орех*, землян* орех*,
      جوز هند, جوز طيب, فستق سوداني, فستق عبيد
    `,
    free: `nut free, sin frutos secos, ללא אגוזים, без орехов, بدون مكسرات`,
  },
  peanuts: {
    terms: `
      peanut, groundnut, satay, monkey nut,
      בוטן, בוטנים, אגוזי אדמה, במבה,
      cacahuete, cacahuate, mani,
      арахис*, землян* орех*,
      فول سوداني, فستق عبيد, فستق سوداني
    `,
    free: `peanut free, ללא בוטנים, sin cacahuete, без арахиса, بدون فول سوداني`,
  },
  gluten: {
    terms: `
      wheat, flour, bread, breadcrumb, breading, panko, pasta, spaghetti, macaroni, noodle, penne,
      fusilli, linguine, fettuccine, lasagna, lasagne, tagliatelle, orzo, ravioli, tortellini,
      gnocchi, couscous, bulgur, semolina, farro, spelt, barley, rye, seitan, soy sauce, teriyaki,
      hoisin, malt, beer, pita, tortilla, baguette, bun, cracker, crouton, biscuit, cookie, graham,
      pastry, phyllo, filo, pie crust, dough, wonton, wrapper, udon, ramen, soba, matzo, matzah,
      durum, kamut, einkorn, freekeh, triticale, oat, oatmeal, muesli, brioche, croissant, bagel,
      naan, ciabatta, sourdough, focaccia, pretzel, bran, gluten, tempura, roux, vermicelli,
      קמח, חיטה, לחם, לחמני*, פסטה, ספגטי, אטריות, איטריות, נודלס, קוסקוס, בורגול, סולת, שעורה,
      שיפון, כוסמין, רוטב סויה, טריאקי, בירה, פיתה, פיתות, טורטיה, טורטיות, בצק, פתיתים, קרקר,
      קרקרים, קרוטונים, ביסקוויט, ביסקוויטים, פתי בר, מצה, מצות, גריס*, פנקו, סייטן, גלוטן,
      שיבולת שועל, קוואקר, לזניה, פנה, מקרוני, ניוקי, רביולי, חלה, בגט, עוגי*, לאפה, לאפות,
      harina, trigo, pan, espagueti*, fideo, macarron, cuscus, semola, cebada, centeno, espelta,
      salsa de soja, salsa de soya, cerveza, galleta, hojaldre, avena, picatoste, bizcocho, lasana,
      мук*, пшени*, хлеб*, панировочн*, сухар*, паста, пасты, пасту, пастой, макарон*, спагетти,
      лапш*, вермишел*, кускус*, булгур*, манк*, манн*, ячмен*, перлов*, рожь, ржи, ржан*, полб*,
      соев* соус*, терияки, пив*, лаваш*, пита, питы, питу, тортиль*, тесто, теста, тестом, батон,
      батона,
      багет*, булк*, булочк*, крекер*, печенье, печенья, печеньем, сейтан, клейковин*, глютен*,
      овес, овса, овсян*, геркулес*, панко, лазань*, пельмен*, вареник*,
      طحين, دقيق, قمح, خبز, بقسماط, معكرونة, مكرونة, باستا, سباغيتي, سباجيتي, شعيرية, نودلز, كسكس,
      برغل, سميد, شعير, جاودار, صلصة صويا, صوص صويا, صويا صوص, ترياكي, بيرة, تورتيلا, عجين, عجينة,
      بسكويت, كعك, توست, فريكة, جريش, شوفان, جلوتين, غلوتين, لازانيا, كرواسون
    `,
    unless: `
      ${each(NON_WHEAT_FLOURS_EN, (grain) => `${grain} flour`)},
      corn tortilla, rice noodle, glass noodle, cellophane noodle, rice vermicelli, zucchini noodle,
      shirataki noodle, konjac noodle, kelp noodle, mung bean noodle, sweet potato noodle,
      rice pasta, chickpea pasta, lentil pasta, corn pasta, rice bran, rice cracker, root beer,
      ginger beer, tortilla chip, rice paper wrapper, pasta de,
      ${each('שקדים, אורז, תירס, קוקוס, חומוס, תפוחי אדמה, טפיוקה, כוסמת, קינואה, טף, עדשים, בוטנים', (grain) => `קמח ${grain}`)},
      טורטיות תירס, טורטיה תירס, אטריות אורז, אטריות שעועית, אטריות זכוכית, אטריות בטטה,
      ${each('almendra, arroz, maiz, coco, garbanzo, tapioca, yuca, patata, papa, quinoa, mandioca', (grain) => `harina de ${grain}`)},
      trigo sarraceno, fideo de arroz, tortilla de maiz, pan de arroz,
      ${each('миндальн*, рисов*, кукурузн*, кокосов*, нутов*, гречнев*, картофельн*, льнян*, соев*, тапиоков*, амарантов*', (grain) => `${grain} мук*, мук* ${grain}`)},
      рисов* лапш*, стеклянн* лапш*, рисов* вермишел*, кукурузн* тортиль*,
      томатн* паст*, арахисов* паст*, карри паст*, паст* карри, мисо паст*, паст* мисо,
      кунжутн* паст*, орехов* паст*, шоколадн* паст*, чесночн* паст*, имбирн* паст*,
      перечн* паст*, паст* чили, чили паст*, паст* тахини, анчоусн* паст*, креветочн* паст*,
      соев* паст*, фасолев* паст*, фиников* паст*, миндальн* паст*, фисташков* паст*,
      паст* харисса,
      ${each('لوز, ارز, ذرة, جوز هند, حمص, تابيوكا, بطاطس, كينوا', (grain) => `دقيق ${grain}, طحين ${grain}`)},
      نودلز ارز, شعيرية ارز, معكرونة ارز, تورتيلا ذرة
    `,
    free: `
      gluten free, glutenfree, wheat free,
      ללא גלוטן, נטול גלוטן,
      sin gluten,
      без глютена, безглютенов*,
      خالي من غلوتين, خالي من جلوتين, خال من غلوتين, خال من جلوتين, بدون غلوتين, بدون جلوتين
    `,
  },
  soy: {
    terms: `
      soy, soya, soybean, tofu, tempeh, edamame, miso, tamari, teriyaki, hoisin, tvp,
      textured vegetable protein, natto, bean curd, shoyu, yuba, kecap, doenjang, gochujang,
      liquid aminos,
      סויה, טופו, טמפה, אדממה, מיסו, טריאקי, הויסין,
      soja,
      соя, сои, сою, соей, соев*, тофу, темпе, эдамаме, мисо, терияки, тамари,
      صويا, توفو, تيمبيه, ادامامي, ميسو, ترياكي
    `,
    free: `soy free, ללא סויה, sin soja, без сои, بدون صويا`,
  },
  sesame: {
    terms: `
      sesame, tahini, tahina, gomasio, halva, halvah, zaatar, za'atar, hummus, houmous, furikake,
      dukkah, benne, everything bagel, baba ganoush, baba ghanoush,
      שומשום, טחינה, חלווה, חלבה, זעתר,
      sesamo, ajonjoli, tahin,
      кунжут*, тахини, тахин*, халв*, хумус*, заатар,
      سمسم, طحينة, طحينية, حلاوة, زعتر
    `,
    free: `sesame free, ללא שומשום, sin sesamo, без кунжута, بدون سمسم`,
  },
};

const DISLIKE_WORDS: Record<DislikeSuggestionKey, RawDictionary> = {
  cilantro: {
    terms: `cilantro, coriander, culantro, כוסברה, кинз*, кориандр*, كزبرة`,
    unless: `
      coriander seed, ground coriander, coriander powder,
      זרעי כוסברה, כוסברה טחונה, כוסברה יבשה,
      semilla de cilantro, cilantro molido,
      молот* кориандр*, семен* кориандр*, зерн* кориандр*,
      كزبرة ناشفة, كزبرة مطحونة, كزبرة جافة, بذور كزبرة
    `,
  },
  mushrooms: {
    terms: `
      mushroom, champignon, portobello, shiitake, porcini, cremini, chanterelle, enoki, morel,
      פטרי*, שמפיניון, פורטובלו, שיטאקי,
      champinon, champinones, seta, hongo,
      гриб*, шампиньон*, вешенк*, лисичк*, опят*,
      فطر, مشروم, عيش غراب, شامبينيون
    `,
  },
  olives: {
    terms: `olive, kalamata, tapenade, זית, זיתים, זיתי, aceituna, oliva, оливк*, маслин*, زيتون`,
    unless: `olive oil, שמן זית, aceite de oliva, оливков* масл*, масл* оливков*, زيت زيتون`,
  },
  onion: {
    terms: `
      onion, shallot, scallion,
      בצל, בצלים, בצלצל*, שאלוט,
      cebolla, cebolleta, chalota,
      лук, лука, луком, луковиц*, шалот*,
      بصل, بصلة
    `,
  },
  garlic: {
    terms: `garlic, שום, ajo, чесно*, ثوم`,
  },
  eggplant: {
    terms: `eggplant, aubergine, brinjal, חציל, חצילים, berenjena, баклажан*, باذنجان`,
  },
  tomato: {
    terms: `
      tomato, tomatoes, passata, עגבני*, tomate, jitomate, помидор*, томат*, طماطم, بندورة, طماطة
    `,
    // A spoon of paste cooks into the sauce: no pieces, no fresh tomato taste. Most people who skip
    // tomatoes eat it, and an alert for it made the warning easy to ignore. Sauce and passata still match.
    unless: `
      tomato paste, tomato concentrate, tomato powder, tomato puree,
      רסק עגבניות, רכז עגבניות,
      pasta de tomate, concentrado de tomate,
      томатн* паст*, томат паст*, томатн* концентрат*,
      معجون طماطم, معجون بندورة, رب بندورة, رب طماطم
    `,
  },
  chili: {
    terms: `
      chili, chilli, chile, jalapeno, habanero, serrano, cayenne, red pepper flake,
      crushed red pepper, hot pepper, sriracha, tabasco, harissa, hot sauce, gochujang, gochugaru,
      sambal, scotch bonnet, chipotle,
      צ'ילי, צילי, פלפל חריף, חריף, חריפה, אריסה, סחוג, שאטה, חלפיניו,
      aji, guindilla, cayena, picante,
      чили, халапеньо, остр* пер*, кайенск*, харисс*, шрирач*, табаско, жгуч*,
      فلفل حار, فليفلة حارة, صلصة حارة, صوص حار, شطة, هريسة, تشيلي, هالبينو
    `,
    unless: `jamon serrano`,
  },
  coconut: {
    terms: `coconut, קוקוס, coco, кокос*, جوز هند, كوكونت`,
  },
  pork: {
    terms: `
      pork, bacon, ham, prosciutto, pancetta, lard, lardon, chorizo, guanciale, speck, mortadella,
      חזיר, בייקון, בשר לבן, פרושוטו, שינקן,
      cerdo, tocino, jamon, panceta, puerco, beicon, chicharron,
      свин*, бекон*, ветчин*, сало, сала, прошутто, панчетт*, хамон*,
      خنزير, لحم خنزير, بيكون
    `,
    unless: `
      turkey bacon, beef bacon, vegan bacon, coconut bacon, turkey ham,
      בייקון טבעוני, בייקון הודו
    `,
  },
};

// ---------------------------------------------------------------------------------------------
// Matcher
// ---------------------------------------------------------------------------------------------

type Word = { text: string; prefix: boolean };
type Phrase = Word[];
type Dictionary = { terms: Phrase[]; unless: Phrase[]; free: Phrase[] };

const HEBREW_PREFIX_LETTERS = 'והבלמשכ';
const ARABIC_PREFIXES = ['وال', 'بال', 'لل', 'ال', 'و'];

function isLatin(text: string): boolean {
  return /^[a-z0-9]+$/.test(text);
}

/** A token as written, plus the same token without a Hebrew or Arabic prefix ("והחלב", "الحليب"). */
function tokenForms(token: string): string[] {
  const first = token.charCodeAt(0);
  if (first >= 0x05d0 && first <= 0x05ea) {
    return token.length >= 3 && HEBREW_PREFIX_LETTERS.includes(token[0]) ? [token, token.slice(1)] : [token];
  }
  if (first >= 0x0600 && first <= 0x06ff) {
    for (const prefix of ARABIC_PREFIXES) {
      if (token.startsWith(prefix) && token.length - prefix.length >= 3) {
        return [token, token.slice(prefix.length)];
      }
    }
  }
  return [token];
}

function toForms(text: string): string[][] {
  const normalized = normalizeFoodText(text);
  return normalized ? normalized.split(' ').map(tokenForms) : [];
}

function compilePhrase(raw: string): Phrase {
  const words: Phrase = [];
  for (const rawWord of raw.trim().split(/\s+/)) {
    const prefix = rawWord.endsWith('*');
    const tokens = normalizeFoodText(rawWord).split(' ').filter(Boolean);
    tokens.forEach((text, index) => {
      words.push({ text, prefix: prefix && index === tokens.length - 1 });
    });
  }
  return words;
}

function compileList(raw: string | undefined): Phrase[] {
  if (!raw) return [];
  return raw
    .split(',')
    .map(compilePhrase)
    .filter((phrase) => phrase.length > 0);
}

function compile(raw: RawDictionary): Dictionary {
  return { terms: compileList(raw.terms), unless: compileList(raw.unless), free: compileList(raw.free) };
}

function wordMatches(forms: string[], word: Word): boolean {
  for (const form of forms) {
    if (form === word.text) return true;
    if (word.prefix) {
      if (form.startsWith(word.text)) return true;
    } else if (isLatin(word.text) && (form === `${word.text}s` || form === `${word.text}es`)) {
      return true;
    }
  }
  return false;
}

function phraseMatchesAt(forms: string[][], start: number, phrase: Phrase): boolean {
  if (start + phrase.length > forms.length) return false;
  for (let offset = 0; offset < phrase.length; offset++) {
    if (!wordMatches(forms[start + offset], phrase[offset])) return false;
  }
  return true;
}

function matchesDictionary(forms: string[][], dictionary: Dictionary): boolean {
  if (forms.length === 0) return false;
  for (const phrase of dictionary.free) {
    for (let start = 0; start < forms.length; start++) {
      if (phraseMatchesAt(forms, start, phrase)) return false;
    }
  }
  const blocked: boolean[] = new Array(forms.length).fill(false);
  for (const phrase of dictionary.unless) {
    for (let start = 0; start < forms.length; start++) {
      if (phraseMatchesAt(forms, start, phrase)) {
        for (let offset = 0; offset < phrase.length; offset++) blocked[start + offset] = true;
      }
    }
  }
  for (const phrase of dictionary.terms) {
    for (let start = 0; start < forms.length; start++) {
      if (!phraseMatchesAt(forms, start, phrase)) continue;
      let free = true;
      for (let offset = 0; offset < phrase.length; offset++) {
        if (blocked[start + offset]) free = false;
      }
      if (free) return true;
    }
  }
  return false;
}

let allergenDictionaries: Record<AllergenKey, Dictionary> | null = null;
let dislikeDictionaries: Record<DislikeSuggestionKey, Dictionary> | null = null;

function allergenDictionary(key: AllergenKey): Dictionary {
  if (!allergenDictionaries) {
    allergenDictionaries = Object.fromEntries(
      ALLERGEN_KEYS.map((allergen) => [allergen, compile(ALLERGEN_WORDS[allergen])]),
    ) as Record<AllergenKey, Dictionary>;
  }
  return allergenDictionaries[key];
}

function dislikeDictionary(key: DislikeSuggestionKey): Dictionary {
  if (!dislikeDictionaries) {
    dislikeDictionaries = Object.fromEntries(
      DISLIKE_SUGGESTION_KEYS.map((dislike) => [dislike, compile(DISLIKE_WORDS[dislike])]),
    ) as Record<DislikeSuggestionKey, Dictionary>;
  }
  return dislikeDictionaries[key];
}

/** True when the typed words are, as a whole, one of the dictionary's own terms. */
function typedIsDictionaryTerm(typed: string[][], dictionary: Dictionary): boolean {
  return dictionary.terms.some(
    (phrase) => phrase.length === typed.length && phraseMatchesAt(typed, 0, phrase),
  );
}

/** The suggestion a typed dislike stands for, in any of the five languages ("Кинза" is cilantro). */
export function dislikeSuggestionFor(item: string): DislikeSuggestionKey | null {
  const typed = toForms(item);
  if (typed.length === 0) return null;
  for (const key of DISLIKE_SUGGESTION_KEYS) {
    if (typedIsDictionaryTerm(typed, dislikeDictionary(key))) return key;
  }
  return null;
}

function allergenFor(item: string): AllergenKey | null {
  const typed = toForms(item);
  if (typed.length === 0) return null;
  for (const key of ALLERGEN_KEYS) {
    if (typedIsDictionaryTerm(typed, allergenDictionary(key))) return key;
  }
  return null;
}

function latinStems(word: string): string[] {
  const stems = [word];
  if (word.length > 3 && word.endsWith('s')) stems.push(word.slice(0, -1));
  if (word.length > 4 && word.endsWith('es')) stems.push(word.slice(0, -2));
  if (word.length > 4 && word.endsWith('ies')) stems.push(`${word.slice(0, -3)}y`);
  return stems;
}

function stripSuffix(word: string, suffixes: string[]): string {
  for (const suffix of suffixes) {
    if (word.endsWith(suffix) && word.length - suffix.length >= 3) return word.slice(0, -suffix.length);
  }
  return word;
}

function sharedPrefixLength(a: string, b: string): number {
  let length = 0;
  while (length < a.length && length < b.length && a[length] === b[length]) length++;
  return length;
}

/**
 * A typed word against a recipe word, forgiving plurals and word endings. `cautious` is for
 * allergies: it also matches a longer word that starts with the typed one ("corn", "cornstarch").
 */
function looseWordMatches(forms: string[], typed: string, cautious: boolean): boolean {
  for (const form of forms) {
    if (form === typed) return true;
    if (isLatin(typed) && isLatin(form)) {
      const typedStems = latinStems(typed);
      if (latinStems(form).some((stem) => typedStems.includes(stem))) return true;
      if (cautious && typed.length >= 4 && form.startsWith(typed)) return true;
      continue;
    }
    const first = typed.charCodeAt(0);
    if (first >= 0x05d0 && first <= 0x05ea) {
      const suffixes = ['ות', 'ים', 'ה', 'ת'];
      if (stripSuffix(form, suffixes) === stripSuffix(typed, suffixes)) return true;
    } else if (first >= 0x0600 && first <= 0x06ff) {
      const suffixes = ['ات', 'ه'];
      if (stripSuffix(form, suffixes) === stripSuffix(typed, suffixes)) return true;
    } else {
      // Cyrillic and others: the same stem with a different ending ("гриб", "грибы").
      const shorter = Math.min(form.length, typed.length);
      if (
        shorter >= 4 &&
        Math.abs(form.length - typed.length) <= 3 &&
        sharedPrefixLength(form, typed) >= Math.max(4, shorter - 2)
      ) {
        return true;
      }
    }
  }
  return false;
}

type ItemMatcher = (forms: string[][]) => boolean;

/** A typed item uses a built-in word list when it names one; otherwise it matches by name. */
function typedMatcher(item: string, cautious: boolean): ItemMatcher | null {
  const typed = toForms(item);
  if (typed.length === 0) return null;
  const suggestion = dislikeSuggestionFor(item);
  if (suggestion) {
    const dictionary = dislikeDictionary(suggestion);
    return (forms) => matchesDictionary(forms, dictionary);
  }
  const allergen = allergenFor(item);
  if (allergen) {
    const dictionary = allergenDictionary(allergen);
    return (forms) => matchesDictionary(forms, dictionary);
  }
  const words = typed.map((forms) => forms[0]);
  return (forms) => {
    for (let start = 0; start + words.length <= forms.length; start++) {
      let all = true;
      for (let offset = 0; offset < words.length; offset++) {
        if (!looseWordMatches(forms[start + offset], words[offset], cautious)) {
          all = false;
          break;
        }
      }
      if (all) return true;
    }
    return false;
  };
}

/** Finds which ingredients are on the cook's avoid list. */
export function findAvoidMatches(ingredientNames: string[], list: AvoidList): AvoidMatches {
  const byIngredient: AvoidMatches['byIngredient'] = ingredientNames.map(() => null);
  const result: AvoidMatches = { allergies: [], dislikes: [], byIngredient };
  if (avoidListIsEmpty(list) || ingredientNames.length === 0) return result;

  const ingredients = ingredientNames.map((name) => ({ name: name.trim(), forms: toForms(name) }));

  function collect(matcher: ItemMatcher, kind: 'allergy' | 'dislike'): string[] {
    const names: string[] = [];
    ingredients.forEach((ingredient, index) => {
      if (!matcher(ingredient.forms)) return;
      if (!names.includes(ingredient.name)) names.push(ingredient.name);
      if (kind === 'allergy' || byIngredient[index] == null) byIngredient[index] = kind;
    });
    return names;
  }

  for (const allergen of ALLERGEN_KEYS) {
    if (!list.allergies.includes(allergen)) continue;
    const dictionary = allergenDictionary(allergen);
    const names = collect((forms) => matchesDictionary(forms, dictionary), 'allergy');
    if (names.length > 0) result.allergies.push({ item: allergen, allergen, ingredients: names });
  }
  for (const item of list.otherAllergies) {
    const matcher = typedMatcher(item, true);
    if (!matcher) continue;
    const names = collect(matcher, 'allergy');
    if (names.length > 0) result.allergies.push({ item, ingredients: names });
  }
  for (const item of list.dislikes) {
    const matcher = typedMatcher(item, false);
    if (!matcher) continue;
    const names = collect(matcher, 'dislike');
    if (names.length > 0) result.dislikes.push({ item, ingredients: names });
  }
  return result;
}

// ---------------------------------------------------------------------------------------------
// Remix instructions (English, for the model)
// ---------------------------------------------------------------------------------------------

const ALLERGEN_ENGLISH: Record<AllergenKey, string> = {
  milk: 'milk and dairy',
  eggs: 'eggs',
  fish: 'fish',
  shellfish: 'shellfish',
  tree_nuts: 'tree nuts',
  peanuts: 'peanuts',
  gluten: 'gluten and wheat',
  soy: 'soy',
  sesame: 'sesame',
};

/** "I am allergic to …" for the remix model, or null when the cook has no allergies. */
export function allergyInstruction(list: AvoidList): string | null {
  const names = [
    ...ALLERGEN_KEYS.filter((key) => list.allergies.includes(key)).map((key) => ALLERGEN_ENGLISH[key]),
    ...list.otherAllergies,
  ];
  if (names.length === 0) return null;
  return `I am allergic to ${names.join(', ')}: remove anything that contains them and use a suitable alternative`;
}

/** "I do not like …" for the remix model, or null when there is nothing to say. */
export function dislikeInstruction(dislikes: string[]): string | null {
  if (dislikes.length === 0) return null;
  return `I do not like ${dislikes.join(', ')}: leave them out or swap them`;
}

/** Joins whole sentences, in order, dropping any that would pass the instruction limit. */
export function fitInstruction(parts: (string | null)[], max = MAX_AVOID_INSTRUCTION_CHARS): string | null {
  let text = '';
  for (const part of parts) {
    if (!part) continue;
    const next = text ? `${text}. ${part}` : part;
    if (next.length <= max) text = next;
  }
  return text || null;
}

/**
 * The request behind "Make it without these": every allergy on the list (the model can catch one
 * the word lists missed), the dislikes found in this recipe, and the appliances the recipe needs that
 * the cook doesn't have (PIN-155; `applianceWorkaroundInstruction` in ownedAppliances.ts). Allergies
 * come first, so they are the last thing left out when the request runs long.
 */
export function makeWithoutInstruction(
  list: AvoidList,
  matches: AvoidMatches,
  appliances: string | null = null,
): string | null {
  return fitInstruction([
    allergyInstruction(list),
    dislikeInstruction(matches.dislikes.map((hit) => hit.item)),
    appliances,
    'Keep the rest of the dish the same',
  ]);
}
