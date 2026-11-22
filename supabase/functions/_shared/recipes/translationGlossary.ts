/**
 * Ingredient and kitchen terms whose usual translation is not the literal one (PIN-53). Each entry lists how the
 * term is written in source recipes (`match`, lower case, any language) and what cooks call it in each target
 * language. Only the entries whose term appears in a recipe go into that recipe's prompt, so the prompt stays short.
 *
 * Spanish follows Spain (Yarden, PIN-53): nata, zumo, patata, levadura química.
 * Add an entry when the translation eval (`eval/translate.ts`) or a user report shows a literal or wrong term.
 */
import type { TranslateLanguageCode } from './translateRecipe.ts';

type Target = Partial<Record<TranslateLanguageCode, string>>;
export type GlossaryEntry = { match: string[] } & Target;

export const TRANSLATION_GLOSSARY: GlossaryEntry[] = [
  { match: ['heavy cream', 'whipping cream', 'double cream', 'שמנת מתוקה', 'שמנת להקצפה', 'nata para montar', 'crème fleurette'], he: 'שמנת מתוקה', en: 'heavy cream', es: 'nata para montar', ru: 'жирные сливки (33%)', ar: 'كريمة الخفق' },
  { match: ['single cream', 'light cream', 'cooking cream', 'שמנת לבישול', 'crème liquide'], he: 'שמנת לבישול', en: 'light cream', es: 'nata para cocinar', ru: 'сливки 10–20%', ar: 'كريمة الطبخ' },
  { match: ['sour cream', 'שמנת חמוצה', 'crème fraîche'], he: 'שמנת חמוצה', en: 'sour cream', es: 'nata agria', ru: 'сметана', ar: 'قشدة حامضة' },
  { match: ['cream cheese', 'גבינת שמנת', 'queso crema', 'frischkäse'], he: 'גבינת שמנת', en: 'cream cheese', es: 'queso crema', ru: 'сливочный сыр', ar: 'جبنة كريمية' },
  { match: ['גבינה לבנה', 'quark', 'fromage blanc'], he: 'גבינה לבנה', en: 'quark (soft white cheese)', es: 'queso quark', ru: 'творожный сыр', ar: 'جبنة بيضاء طرية' },
  { match: ['cottage cheese', "קוטג'", 'קוטג׳'], he: 'קוטג׳', en: 'cottage cheese', es: 'requesón', ru: 'зернёный творог', ar: 'جبنة قريش' },
  { match: ['buttermilk', 'רויון', 'חלב חמוץ'], he: 'רויון', en: 'buttermilk', es: 'suero de mantequilla', ru: 'пахта', ar: 'لبن رائب' },
  { match: ['evaporated milk', 'חלב מאודה'], he: 'חלב מאודה', en: 'evaporated milk', es: 'leche evaporada', ru: 'концентрированное молоко без сахара', ar: 'حليب مبخر' },
  { match: ['condensed milk', 'חלב מרוכז', 'lait concentré'], he: 'חלב מרוכז ממותק', en: 'sweetened condensed milk', es: 'leche condensada', ru: 'сгущённое молоко', ar: 'حليب مكثف محلى' },
  { match: ['self-raising flour', 'self-rising flour', 'קמח תופח'], he: 'קמח תופח', en: 'self-raising flour', es: 'harina con levadura', ru: 'мука с разрыхлителем', ar: 'دقيق ذاتي التخمير' },
  { match: ['all-purpose flour', 'plain flour', 'קמח לבן', 'קמח רגיל', 'farine'], he: 'קמח לבן', en: 'all-purpose flour', es: 'harina de trigo', ru: 'пшеничная мука', ar: 'دقيق أبيض' },
  { match: ['bread flour', 'strong flour', 'קמח לחם'], he: 'קמח לחם', en: 'bread flour', es: 'harina de fuerza', ru: 'хлебопекарная мука', ar: 'دقيق الخبز' },
  { match: ['cornstarch', 'cornflour', 'corn starch', 'קורנפלור', 'עמילן תירס', 'maïzena', 'maicena'], he: 'קורנפלור', en: 'cornstarch', es: 'maicena', ru: 'кукурузный крахмал', ar: 'نشا الذرة' },
  { match: ['baking soda', 'bicarbonate of soda', 'סודה לשתייה', 'bicarbonate'], he: 'סודה לשתייה', en: 'baking soda', es: 'bicarbonato sódico', ru: 'пищевая сода', ar: 'بيكربونات الصوديوم' },
  { match: ['baking powder', 'אבקת אפייה', 'אבקת אפיה', 'levure chimique', 'backpulver', 'kabartma tozu', 'polvo para hornear'], he: 'אבקת אפייה', en: 'baking powder', es: 'levadura química', ru: 'разрыхлитель', ar: 'بيكنج باودر' },
  { match: ['instant yeast', 'dry yeast', 'שמרים יבשים', 'toz maya'], he: 'שמרים יבשים', en: 'instant yeast', es: 'levadura seca de panadería', ru: 'сухие дрожжи', ar: 'خميرة فورية' },
  { match: ['caster sugar', 'superfine sugar', 'סוכר דק'], he: 'סוכר דק', en: 'caster sugar', es: 'azúcar extrafino', ru: 'мелкий сахар', ar: 'سكر ناعم' },
  { match: ['powdered sugar', 'icing sugar', "confectioners' sugar", 'אבקת סוכר', 'puderzucker', 'sucre glace'], he: 'אבקת סוכר', en: 'powdered sugar', es: 'azúcar glas', ru: 'сахарная пудра', ar: 'سكر بودرة' },
  { match: ['brown sugar', 'סוכר חום', 'sucre roux', 'esmer şeker'], he: 'סוכר חום', en: 'brown sugar', es: 'azúcar moreno', ru: 'коричневый сахар', ar: 'سكر بني' },
  { match: ['vanilla sugar', 'סוכר וניל', 'vanillezucker', 'sucre vanillé'], he: 'סוכר וניל', en: 'vanilla sugar', es: 'azúcar avainillado', ru: 'ванильный сахар', ar: 'سكر الفانيليا' },
  { match: ['silan', 'date syrup', 'סילאן'], he: 'סילאן', en: 'silan (date syrup)', es: 'sirope de dátiles', ru: 'финиковый сироп', ar: 'دبس التمر' },
  { match: ['chocolate chips', "שוקולד צ'יפס", 'שוקולד צ׳יפס', 'pépites de chocolat', 'damla çikolata'], he: 'שוקולד צ׳יפס', en: 'chocolate chips', es: 'pepitas de chocolate', ru: 'шоколадные капли', ar: 'رقائق الشوكولاتة' },
  { match: ['dark chocolate', 'semi-sweet chocolate', 'bittersweet chocolate', 'שוקולד מריר', 'chocolat noir'], he: 'שוקולד מריר', en: 'dark chocolate', es: 'chocolate negro', ru: 'тёмный шоколад', ar: 'شوكولاتة داكنة' },
  { match: ['petit beurre', 'פתי בר', 'galletas maría', 'galletas maria', 'butterkekse'], he: 'ביסקוויטים (פתי בר)', en: 'petit beurre biscuits', es: 'galletas María', ru: 'песочное печенье', ar: 'بسكويت بتي بور' },
  { match: ['brown onion', 'yellow onion', 'בצל יבש'], he: 'בצל', en: 'onion', es: 'cebolla', ru: 'репчатый лук', ar: 'بصل' },
  { match: ['green onion', 'spring onion', 'scallion', 'בצל ירוק'], he: 'בצל ירוק', en: 'green onion', es: 'cebolleta', ru: 'зелёный лук', ar: 'بصل أخضر' },
  { match: ['cilantro', 'fresh coriander', 'כוסברה'], he: 'כוסברה', en: 'cilantro', es: 'cilantro', ru: 'кинза', ar: 'كزبرة' },
  { match: ['zucchini', 'courgette', 'קישוא', 'קישואים'], he: 'קישוא', en: 'zucchini', es: 'calabacín', ru: 'кабачок', ar: 'كوسا' },
  { match: ['eggplant', 'aubergine', 'חציל'], he: 'חציל', en: 'eggplant', es: 'berenjena', ru: 'баклажан', ar: 'باذنجان' },
  { match: ['bell pepper', 'גמבה', 'pimiento'], he: 'פלפל', en: 'bell pepper', es: 'pimiento', ru: 'болгарский перец', ar: 'فلفل رومي' },
  { match: ['potato', 'potatoes', 'תפוח אדמה', 'תפוחי אדמה', 'patates'], he: 'תפוח אדמה', en: 'potato', es: 'patata', ru: 'картофель', ar: 'بطاطس' },
  { match: ['sweet potato', 'בטטה'], he: 'בטטה', en: 'sweet potato', es: 'boniato', ru: 'батат', ar: 'بطاطا حلوة' },
  { match: ['lemon juice', 'מיץ לימון', 'jus de citron'], he: 'מיץ לימון', en: 'lemon juice', es: 'zumo de limón', ru: 'лимонный сок', ar: 'عصير الليمون' },
  { match: ['orange juice', 'מיץ תפוזים'], he: 'מיץ תפוזים', en: 'orange juice', es: 'zumo de naranja', ru: 'апельсиновый сок', ar: 'عصير البرتقال' },
  { match: ['chicken stock', 'chicken broth', 'ציר עוף'], he: 'ציר עוף', en: 'chicken stock', es: 'caldo de pollo', ru: 'куриный бульон', ar: 'مرق الدجاج' },
  { match: ['soup powder', 'אבקת מרק'], he: 'אבקת מרק', en: 'chicken soup powder', es: 'caldo de pollo en polvo', ru: 'сухой куриный бульон', ar: 'مسحوق مرقة الدجاج' },
  { match: ['ground beef', 'minced beef', 'minced meat', 'בשר טחון', 'viande hachée'], he: 'בשר טחון', en: 'ground beef', es: 'carne picada', ru: 'фарш', ar: 'لحم مفروم' },
  { match: ['brisket', 'חזה בקר'], he: 'חזה בקר', en: 'brisket', es: 'pecho de ternera', ru: 'говяжья грудинка', ar: 'صدر بقري' },
  { match: ['pumpkin seeds', 'גרעיני דלעת', 'זרעי דלעת'], he: 'גרעיני דלעת', en: 'pumpkin seeds', es: 'pipas de calabaza', ru: 'тыквенные семечки', ar: 'بذور اليقطين' },
  { match: ['air fryer', 'air fry', "אייר פרייר", 'סיר טיגון באוויר'], he: 'אייר פרייר', en: 'air fryer', es: 'freidora de aire', ru: 'аэрогриль', ar: 'قلاية هوائية' },
  { match: ['slow cooker', 'crock-pot', 'crockpot', 'סיר בישול איטי'], he: 'סיר בישול איטי', en: 'slow cooker', es: 'olla de cocción lenta', ru: 'медленноварка', ar: 'قدر الطهي البطيء' },
  { match: ['ramekin', 'ramekins', 'רמקין'], he: 'רמקין', en: 'ramekin', es: 'ramequín', ru: 'порционная формочка', ar: 'رامكين' },
  { match: ['loaf pan', 'loaf tin', 'תבנית אינגליש קייק'], he: 'תבנית אינגליש קייק', en: 'loaf pan', es: 'molde rectangular', ru: 'форма для кекса', ar: 'قالب مستطيل' },
  { match: ['parchment paper', 'baking paper', 'baking parchment', 'נייר אפייה'], he: 'נייר אפייה', en: 'parchment paper', es: 'papel de horno', ru: 'пергамент', ar: 'ورق الزبدة' },
  { match: ['stiff peaks', 'soft peaks'], he: 'קצף יציב', en: 'stiff peaks', es: 'a punto de nieve', ru: 'до устойчивых пиков', ar: 'حتى تتكون قمم ثابتة' },
  { match: ['fold in', 'fold the', 'fold through'], he: 'מקפלים פנימה', en: 'fold in', es: 'incorpora con movimientos envolventes', ru: 'аккуратно вмешайте', ar: 'قلّب برفق' },
];

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[׳`´’‘]/g, "'")
    .replace(/[֑-ׇ]/g, '')
    .replace(/\s+/g, ' ');
}

/** The glossary lines for one recipe: "<term as written> → <target term>", one per matching entry. */
export function glossaryFor(text: string, target: TranslateLanguageCode): string[] {
  const haystack = normalize(text);
  const lines: string[] = [];
  for (const entry of TRANSLATION_GLOSSARY) {
    const wanted = entry[target];
    if (!wanted) continue;
    const found = entry.match.find((term) => haystack.includes(normalize(term)));
    if (found && normalize(found) !== normalize(wanted)) lines.push(`"${found}" → ${wanted}`);
  }
  return lines;
}
