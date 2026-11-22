// Page text for the share page in the app's five languages (ADR 022). Recipe text itself is
// never translated here: it is shown in the language it was saved in.
// Store names, "Privacy" and "Terms" match landing/strings/<lang>.json.

export const PAGE_LANGUAGES = ['en', 'es', 'he', 'ru', 'ar'] as const;
export type PageLanguage = (typeof PAGE_LANGUAGES)[number];

export interface PageStrings {
  sharedWithYou: string;
  minutes: string;
  serves: string;
  ingredientCount: string;
  /** Labels under the fact tiles, in the web app's words (recipe.factTime, recipe.servings, recipe.factCalories). */
  factTime: string;
  factServings: string;
  factCalories: string;
  ingredients: string;
  steps: string;
  openInApp: string;
  saveOnWeb: string;
  getApp: string;
  originalOn: string;
  originalAt: string;
  promoTitle: string;
  promoBody: string;
  appStore: string;
  googlePlay: string;
  privacy: string;
  terms: string;
  notFoundTitle: string;
  notFoundBody: string;
  goHome: string;
  unavailableTitle: string;
  unavailableBody: string;
  leadShared: string;
  leadSaved: string;
  /** Hub page eyebrow and description lead (PIN-124). {source} is a platform or a site. */
  creditFrom: string;
  /** Under the steps of a Hub page: the recipe is the creator's, the write-up is ours. */
  creditNote: string;
  hubNotFoundBody: string;
}

const STRINGS: Record<PageLanguage, PageStrings> = {
  en: {
    sharedWithYou: 'Shared with you on Pinch',
    minutes: '{n} min',
    serves: 'Serves {n}',
    ingredientCount: '{n} ingredients',
    factTime: 'Total time',
    factServings: 'Servings',
    factCalories: 'Cal / serving',
    ingredients: 'Ingredients',
    steps: 'Steps',
    openInApp: 'Open in Pinch',
    saveOnWeb: 'Save it on the web',
    getApp: 'Get the app',
    originalOn: 'Original recipe on {platform}',
    originalAt: 'Original recipe at {site}',
    promoTitle: 'Save recipes from any cooking video',
    promoBody:
      'Pinch turns TikTok, Instagram and YouTube videos into recipes you can scale, shop for and cook from. Get the app to save this one with a tap.',
    appStore: 'Download on the App Store',
    googlePlay: 'Get it on Google Play',
    privacy: 'Privacy',
    terms: 'Terms',
    notFoundTitle: 'This recipe isn’t available',
    notFoundBody: 'The recipe may have been removed. Ask your friend to share it again.',
    goHome: 'Go to Pinch',
    unavailableTitle: 'Someone shared a recipe with you',
    unavailableBody: 'We couldn’t load the preview right now. Open it in Pinch instead.',
    leadShared: 'A recipe shared from Pinch',
    leadSaved: 'A recipe saved from {platform} with Pinch',
    creditFrom: 'Recipe from {source}',
    creditNote:
      'All credit goes to the original creator. Pinch wrote out these steps from the original on {source}. Watch it for every detail.',
    hubNotFoundBody: 'This recipe may have been removed from Pinch.',
  },
  es: {
    sharedWithYou: 'Compartida contigo en Pinch',
    minutes: '{n} min',
    serves: 'Para {n}',
    ingredientCount: '{n} ingredientes',
    factTime: 'Tiempo total',
    factServings: 'Porciones',
    factCalories: 'Cal / ración',
    ingredients: 'Ingredientes',
    steps: 'Pasos',
    openInApp: 'Abrir en Pinch',
    saveOnWeb: 'Guardarla en la web',
    getApp: 'Descargar la app',
    originalOn: 'Receta original en {platform}',
    originalAt: 'Receta original en {site}',
    promoTitle: 'Guarda recetas de cualquier video de cocina',
    promoBody:
      'Pinch convierte videos de TikTok, Instagram y YouTube en recetas que puedes escalar, comprar y cocinar. Descarga la app para guardar esta con un toque.',
    appStore: 'Descárgalo en el App Store',
    googlePlay: 'Disponible en Google Play',
    privacy: 'Privacidad',
    terms: 'Términos',
    notFoundTitle: 'Esta receta no está disponible',
    notFoundBody: 'Puede que la receta se haya eliminado. Pídele a quien te la envió que la comparta de nuevo.',
    goHome: 'Ir a Pinch',
    unavailableTitle: 'Alguien compartió una receta contigo',
    unavailableBody: 'No pudimos cargar la vista previa. Ábrela en Pinch.',
    leadShared: 'Una receta compartida desde Pinch',
    leadSaved: 'Una receta guardada de {platform} con Pinch',
    creditFrom: 'Receta de {source}',
    creditNote:
      'Todo el mérito es de quien la creó. Pinch escribió estos pasos a partir del original en {source}. Míralo para no perderte ningún detalle.',
    hubNotFoundBody: 'Puede que esta receta se haya eliminado de Pinch.',
  },
  he: {
    sharedWithYou: 'שותף איתך ב־Pinch',
    minutes: '{n} דק׳',
    serves: '{n} מנות',
    ingredientCount: '{n} מרכיבים',
    factTime: 'זמן כולל',
    factServings: 'מנות',
    factCalories: 'קל׳ למנה',
    ingredients: 'מרכיבים',
    steps: 'שלבים',
    openInApp: 'פתיחה ב־Pinch',
    saveOnWeb: 'שמירה בדפדפן',
    getApp: 'להורדת האפליקציה',
    originalOn: 'המתכון המקורי ב־{platform}',
    originalAt: 'המתכון המקורי ב־{site}',
    promoTitle: 'שומרים מתכונים מכל סרטון בישול',
    promoBody:
      'Pinch הופכת סרטונים מ־TikTok, Instagram ו־YouTube למתכונים שאפשר להתאים לכמות, לקנות לפיהם ולבשל. הורידו את האפליקציה ושמרו את המתכון הזה בנגיעה.',
    appStore: 'להורדה מה־App Store',
    googlePlay: 'זמין ב־Google Play',
    privacy: 'פרטיות',
    terms: 'תנאים',
    notFoundTitle: 'המתכון הזה לא זמין',
    notFoundBody: 'ייתכן שהמתכון נמחק. בקשו ממי ששלח אותו לשתף שוב.',
    goHome: 'ל־Pinch',
    unavailableTitle: 'מישהו שיתף איתך מתכון',
    unavailableBody: 'לא הצלחנו לטעון את התצוגה המקדימה כרגע. אפשר לפתוח אותו ב־Pinch.',
    leadShared: 'מתכון ששותף מ־Pinch',
    leadSaved: 'מתכון שנשמר מ־{platform} עם Pinch',
    creditFrom: 'מתכון מ־{source}',
    creditNote:
      'כל הקרדיט ליוצר המקורי. Pinch כתבה את השלבים לפי המקור ב־{source}. כדאי לצפות בו לכל הפרטים.',
    hubNotFoundBody: 'ייתכן שהמתכון הוסר מ־Pinch.',
  },
  ru: {
    sharedWithYou: 'С вами поделились в Pinch',
    minutes: '{n} мин',
    serves: 'Порций: {n}',
    ingredientCount: 'Ингредиентов: {n}',
    factTime: 'Общее время',
    factServings: 'Порции',
    factCalories: 'ккал / порция',
    ingredients: 'Ингредиенты',
    steps: 'Шаги',
    openInApp: 'Открыть в Pinch',
    saveOnWeb: 'Сохранить в браузере',
    getApp: 'Скачать приложение',
    originalOn: 'Оригинальный рецепт в {platform}',
    originalAt: 'Оригинальный рецепт: {site}',
    promoTitle: 'Сохраняйте рецепты из любых кулинарных видео',
    promoBody:
      'Pinch превращает видео из TikTok, Instagram и YouTube в рецепты: их можно пересчитать на нужное число порций, составить список покупок и готовить по шагам. Скачайте приложение, чтобы сохранить этот рецепт одним нажатием.',
    appStore: 'Загрузите в App Store',
    googlePlay: 'Доступно в Google Play',
    privacy: 'Конфиденциальность',
    terms: 'Условия',
    notFoundTitle: 'Этот рецепт недоступен',
    notFoundBody: 'Возможно, рецепт удалили. Попросите прислать его ещё раз.',
    goHome: 'Перейти в Pinch',
    unavailableTitle: 'С вами поделились рецептом',
    unavailableBody: 'Сейчас не удалось загрузить превью. Откройте рецепт в Pinch.',
    leadShared: 'Рецепт из Pinch',
    leadSaved: 'Рецепт из {platform}, сохранённый в Pinch',
    creditFrom: 'Рецепт из {source}',
    creditNote:
      'Все заслуги принадлежат автору. Pinch записал эти шаги по оригиналу в {source}. Посмотрите его, чтобы не упустить детали.',
    hubNotFoundBody: 'Возможно, этот рецепт удалили из Pinch.',
  },
  ar: {
    sharedWithYou: 'تمت مشاركتها معك على Pinch',
    minutes: '{n} دقيقة',
    serves: 'تكفي {n}',
    ingredientCount: '{n} مكونات',
    factTime: 'الوقت الكلي',
    factServings: 'حصص',
    factCalories: 'سعرة / حصة',
    ingredients: 'المكونات',
    steps: 'الخطوات',
    openInApp: 'افتح في Pinch',
    saveOnWeb: 'احفظها على الويب',
    getApp: 'حمّل التطبيق',
    originalOn: 'الوصفة الأصلية على {platform}',
    originalAt: 'الوصفة الأصلية على {site}',
    promoTitle: 'احفظ الوصفات من أي فيديو طبخ',
    promoBody:
      'يحوّل Pinch فيديوهات TikTok وInstagram وYouTube إلى وصفات يمكنك تعديل كمياتها والتسوّق لها والطبخ منها. حمّل التطبيق لتحفظ هذه الوصفة بلمسة.',
    appStore: 'تنزيل من App Store',
    googlePlay: 'احصل عليه من Google Play',
    privacy: 'الخصوصية',
    terms: 'الشروط',
    notFoundTitle: 'هذه الوصفة غير متاحة',
    notFoundBody: 'ربما تم حذف الوصفة. اطلب من صديقك مشاركتها مرة أخرى.',
    goHome: 'اذهب إلى Pinch',
    unavailableTitle: 'شارك أحدهم وصفة معك',
    unavailableBody: 'تعذّر تحميل المعاينة الآن. افتحها في Pinch بدلًا من ذلك.',
    leadShared: 'وصفة تمت مشاركتها من Pinch',
    leadSaved: 'وصفة محفوظة من {platform} عبر Pinch',
    creditFrom: 'وصفة من {source}',
    creditNote:
      'كل الفضل لصاحب الوصفة الأصلي. كتب Pinch هذه الخطوات من الأصل على {source}. شاهده لكل التفاصيل.',
    hubNotFoundBody: 'ربما أُزيلت هذه الوصفة من Pinch.',
  },
};

const RTL: ReadonlySet<PageLanguage> = new Set<PageLanguage>(['he', 'ar']);

function asPageLanguage(code: string | undefined | null): PageLanguage | undefined {
  const base = code?.trim().toLowerCase().split(/[-_]/)[0];
  if (base === 'iw') return 'he';
  return (PAGE_LANGUAGES as readonly string[]).includes(base ?? '') ? (base as PageLanguage) : undefined;
}

/**
 * The page speaks the visitor's browser language when we have it. Link-preview crawlers send
 * no Accept-Language, so they get the recipe's own language, which is the likeliest language of
 * the chat it was shared into. English is the fallback.
 */
export function pickLanguage(acceptLanguage: string | null | undefined, recipeLanguage?: string | null): PageLanguage {
  const ranked = (acceptLanguage ?? '')
    .split(',')
    .map((part, index) => {
      const [tag, ...params] = part.trim().split(';');
      const q = params.map((p) => /^q=([\d.]+)$/.exec(p.trim())).find(Boolean);
      return { tag, q: q ? Number(q[1]) : 1, index };
    })
    .filter((entry) => entry.tag && entry.q > 0)
    .sort((a, b) => b.q - a.q || a.index - b.index);
  for (const entry of ranked) {
    const lang = asPageLanguage(entry.tag);
    if (lang) return lang;
  }
  if (ranked.length) return 'en';
  return asPageLanguage(recipeLanguage) ?? 'en';
}

export function stringsFor(lang: PageLanguage): PageStrings {
  return STRINGS[lang];
}

export function isRtl(lang: PageLanguage): boolean {
  return RTL.has(lang);
}

export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
