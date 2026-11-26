// The words of the two nudges (push and email) in the five app languages. {title} is a saved
// recipe's title. Lead with what the person gets (time, money, an easy dinner), not with how
// Pinch works. Keep pushes short: iOS shows about two lines of the body.
import type { EmailLocale } from './copy.ts';

export type NudgeKind = 'day1' | 'day3' | 'pantry_rescan';

export interface NudgeText {
  pushTitle: string;
  pushBody: string;
  subject: string;
  preheader: string;
  title: string;
  intro: string;
  tip: string;
  button: string;
}

export interface NudgeCopy {
  day1: NudgeText;
  day3: NudgeText;
  /** Two weeks after the last pantry scan (PIN-181). No placeholder: it opens the scan. */
  pantry_rescan: NudgeText;
}

const en: NudgeCopy = {
  day1: {
    pushTitle: 'Your first recipe takes 30 seconds',
    pushBody: 'Share a recipe video to Pinch, or pick one from the Hub. No more pausing to write things down.',
    subject: 'Your first recipe takes 30 seconds',
    preheader: 'Share a video, get the ingredients and steps. Or pick a favourite from the Hub.',
    title: "Let's get your first recipe in",
    intro:
      'Seen something on TikTok or Instagram you want to make? Share it to Pinch and you get the ingredients, the steps and a shopping list. No pausing, no screenshots.',
    tip: 'No link handy? Open the Hub, pick a popular recipe and save it in one tap.',
    button: 'Get my first recipe',
  },
  day3: {
    pushTitle: 'Dinner tonight: {title}?',
    pushBody: "It's saved and ready. See what you need, add the rest to your list, cook step by step.",
    subject: 'Cook {title} tonight?',
    preheader: 'Your ingredients and steps are ready. Add what you’re missing to the list in one tap.',
    title: 'Ready to cook {title}?',
    intro:
      'You saved it, so the hard part is done. Open it to see what you need, add what’s missing to your shopping list, and follow the steps one at a time while you cook.',
    tip: 'When you’re done, tap “I cooked this” so you can find your hits again.',
    button: 'Open the recipe',
  },
  pantry_rescan: {
    pushTitle: 'Quick pantry check?',
    pushBody: 'Two weeks since your last scan. A few photos keep your shopping list from buying what you already have.',
    subject: 'Time for a quick pantry check',
    preheader: 'A few photos of the fridge and cupboards, and your list skips what you already have.',
    title: 'Is your pantry still right?',
    intro:
      'It’s been two weeks since you scanned your kitchen. Snap the fridge and cupboards again and Pinch updates the list, so you don’t buy what you already have and you see what you can cook tonight.',
    tip: 'Short on time? Just scan the fridge. It changes the most.',
    button: 'Scan my kitchen',
  },
};

const es: NudgeCopy = {
  day1: {
    pushTitle: 'Tu primera receta tarda 30 segundos',
    pushBody: 'Comparte un video de receta con Pinch o elige una del Hub. Se acabó pausar para apuntar.',
    subject: 'Tu primera receta tarda 30 segundos',
    preheader: 'Comparte un video y obtén ingredientes y pasos. O elige una favorita del Hub.',
    title: 'Guardemos tu primera receta',
    intro:
      '¿Viste algo en TikTok o Instagram que quieres preparar? Compártelo con Pinch y tendrás los ingredientes, los pasos y una lista de compras. Sin pausar, sin capturas.',
    tip: '¿No tienes un enlace a mano? Abre el Hub, elige una receta popular y guárdala con un toque.',
    button: 'Conseguir mi primera receta',
  },
  day3: {
    pushTitle: '¿Cenamos {title} hoy?',
    pushBody: 'Ya está guardada. Mira qué necesitas, añade lo que falta a tu lista y cocina paso a paso.',
    subject: '¿Cocinas {title} esta noche?',
    preheader: 'Tus ingredientes y pasos están listos. Añade lo que te falta a la lista con un toque.',
    title: '¿Listo para cocinar {title}?',
    intro:
      'Ya la guardaste, así que lo difícil está hecho. Ábrela para ver qué necesitas, añade lo que falta a tu lista de compras y sigue los pasos uno a uno mientras cocinas.',
    tip: 'Cuando termines, toca «Lo cociné» para volver a encontrar tus éxitos.',
    button: 'Abrir la receta',
  },
  pantry_rescan: {
    pushTitle: '¿Repasamos la despensa?',
    pushBody: 'Han pasado dos semanas desde tu último escaneo. Unas fotos y no compras lo que ya tienes.',
    subject: 'Es hora de repasar la despensa',
    preheader: 'Unas fotos de la nevera y los armarios, y tu lista se salta lo que ya tienes.',
    title: '¿Tu despensa sigue al día?',
    intro:
      'Han pasado dos semanas desde que escaneaste tu cocina. Haz fotos otra vez de la nevera y los armarios y Pinch actualiza la lista, así no compras lo que ya tienes y ves qué puedes cocinar esta noche.',
    tip: '¿Poco tiempo? Escanea solo la nevera. Es lo que más cambia.',
    button: 'Escanear mi cocina',
  },
};

const he: NudgeCopy = {
  day1: {
    pushTitle: 'המתכון הראשון שלך לוקח 30 שניות',
    pushBody: 'שתפו סרטון מתכון ל-Pinch או בחרו אחד מה-Hub. בלי לעצור את הסרטון כדי לרשום.',
    subject: 'המתכון הראשון שלך לוקח 30 שניות',
    preheader: 'משתפים סרטון ומקבלים מצרכים ושלבים. או בוחרים מתכון אהוב מה-Hub.',
    title: 'בואו נשמור את המתכון הראשון',
    intro:
      'ראיתם משהו בטיקטוק או באינסטגרם שבא לכם להכין? שתפו אותו ל-Pinch ותקבלו את המצרכים, השלבים ורשימת קניות. בלי לעצור, בלי צילומי מסך.',
    tip: 'אין קישור בהישג יד? פתחו את ה-Hub, בחרו מתכון פופולרי ושמרו אותו בנגיעה.',
    button: 'לשמור את המתכון הראשון',
  },
  day3: {
    pushTitle: 'מה לארוחת ערב? אולי {title}',
    pushBody: 'הוא כבר שמור. רואים מה צריך, מוסיפים את החסר לרשימה ומבשלים שלב אחרי שלב.',
    subject: 'מבשלים היום {title}?',
    preheader: 'המצרכים והשלבים מוכנים. מוסיפים את מה שחסר לרשימה בנגיעה.',
    title: 'מוכנים לבשל {title}?',
    intro:
      'כבר שמרתם אותו, אז החלק הקשה מאחוריכם. פתחו אותו כדי לראות מה צריך, הוסיפו את החסר לרשימת הקניות ועקבו אחרי השלבים אחד אחד בזמן הבישול.',
    tip: 'בסוף, הקישו על "בישלתי את זה" כדי למצוא שוב את המנות שהצליחו.',
    button: 'לפתוח את המתכון',
  },
  pantry_rescan: {
    pushTitle: 'בדיקה קטנה במזווה?',
    pushBody: 'עברו שבועיים מהסריקה האחרונה. כמה תמונות, ולא קונים שוב מה שכבר יש בבית.',
    subject: 'הגיע הזמן לבדיקה קטנה במזווה',
    preheader: 'כמה תמונות של המקרר והארונות, ורשימת הקניות מדלגת על מה שכבר יש.',
    title: 'המזווה שלכם עדיין מעודכן?',
    intro:
      'עברו שבועיים מאז שסרקתם את המטבח. צלמו שוב את המקרר והארונות, והרשימה תתעדכן: לא תקנו מה שכבר יש, ותראו מה אפשר לבשל הערב.',
    tip: 'אין זמן? סרקו רק את המקרר. שם הכי הרבה משתנה.',
    button: 'סריקת המטבח',
  },
};

const ru: NudgeCopy = {
  day1: {
    pushTitle: 'Первый рецепт — за 30 секунд',
    pushBody: 'Отправьте видео с рецептом в Pinch или выберите рецепт в Hub. Больше не нужно ставить на паузу и записывать.',
    subject: 'Первый рецепт — за 30 секунд',
    preheader: 'Отправьте видео и получите ингредиенты и шаги. Или выберите любимый рецепт в Hub.',
    title: 'Сохраним ваш первый рецепт',
    intro:
      'Увидели в TikTok или Instagram блюдо, которое хочется приготовить? Отправьте его в Pinch и получите ингредиенты, шаги и список покупок. Без пауз и скриншотов.',
    tip: 'Нет ссылки под рукой? Откройте Hub, выберите популярный рецепт и сохраните его одним касанием.',
    button: 'Получить первый рецепт',
  },
  day3: {
    pushTitle: 'На ужин сегодня — {title}?',
    pushBody: 'Рецепт уже сохранён. Посмотрите, что нужно, добавьте недостающее в список и готовьте шаг за шагом.',
    subject: 'Приготовите {title} сегодня?',
    preheader: 'Ингредиенты и шаги готовы. Добавьте недостающее в список одним касанием.',
    title: 'Готовы приготовить {title}?',
    intro:
      'Вы его уже сохранили, так что самое сложное позади. Откройте рецепт, посмотрите, что нужно, добавьте недостающее в список покупок и следуйте шагам по одному, пока готовите.',
    tip: 'Когда закончите, нажмите «Я это приготовил(а)», чтобы потом легко найти удачные блюда.',
    button: 'Открыть рецепт',
  },
  pantry_rescan: {
    pushTitle: 'Проверим запасы?',
    pushBody: 'Прошло две недели с последнего сканирования. Пара фото — и вы не купите то, что уже есть.',
    subject: 'Пора быстро проверить запасы',
    preheader: 'Пара фото холодильника и шкафов, и список покупок пропустит то, что уже есть.',
    title: 'Запасы всё ещё актуальны?',
    intro:
      'Прошло две недели с тех пор, как вы сканировали кухню. Сфотографируйте холодильник и шкафы ещё раз, и Pinch обновит список: вы не купите лишнего и увидите, что можно приготовить сегодня.',
    tip: 'Мало времени? Отсканируйте только холодильник: там меняется больше всего.',
    button: 'Сканировать кухню',
  },
};

const ar: NudgeCopy = {
  day1: {
    pushTitle: 'وصفتك الأولى تحتاج 30 ثانية',
    pushBody: 'شارك فيديو وصفة مع Pinch أو اختر وصفة من Hub. لا حاجة لإيقاف الفيديو والكتابة بعد الآن.',
    subject: 'وصفتك الأولى تحتاج 30 ثانية',
    preheader: 'شارك فيديو واحصل على المكونات والخطوات. أو اختر وصفة مفضلة من Hub.',
    title: 'لنحفظ وصفتك الأولى',
    intro:
      'رأيت شيئًا على TikTok أو Instagram وتريد تحضيره؟ شاركه مع Pinch لتحصل على المكونات والخطوات وقائمة تسوق. بلا توقف ولا لقطات شاشة.',
    tip: 'ليس لديك رابط الآن؟ افتح Hub واختر وصفة رائجة واحفظها بلمسة واحدة.',
    button: 'احصل على وصفتي الأولى',
  },
  day3: {
    pushTitle: 'عشاء الليلة: {title}؟',
    pushBody: 'الوصفة محفوظة وجاهزة. اعرف ما تحتاجه، وأضف الناقص إلى قائمتك، واطبخ خطوة بخطوة.',
    subject: 'هل تطبخ {title} الليلة؟',
    preheader: 'المكونات والخطوات جاهزة. أضف ما ينقصك إلى القائمة بلمسة واحدة.',
    title: 'جاهز لطبخ {title}؟',
    intro:
      'لقد حفظتها، فالجزء الصعب انتهى. افتحها لترى ما تحتاجه، وأضف الناقص إلى قائمة التسوق، واتبع الخطوات واحدة تلو الأخرى أثناء الطبخ.',
    tip: 'عندما تنتهي، اضغط على «طبخت هيدا» لتجد أطباقك الناجحة لاحقًا.',
    button: 'افتح الوصفة',
  },
  pantry_rescan: {
    pushTitle: 'نراجع المؤونة بسرعة؟',
    pushBody: 'مرّ أسبوعان على آخر مسح. بضع صور، ولن تشتري ما عندك أصلًا.',
    subject: 'حان وقت مراجعة سريعة للمؤونة',
    preheader: 'بضع صور للثلاجة والخزائن، وقائمة التسوق تتخطى ما عندك.',
    title: 'هل مؤونتك ما زالت محدّثة؟',
    intro:
      'مرّ أسبوعان منذ مسحت مطبخك. صوّر الثلاجة والخزائن من جديد وسيحدّث Pinch القائمة، فلا تشتري ما عندك وترى ما يمكنك طبخه الليلة.',
    tip: 'وقتك ضيق؟ امسح الثلاجة فقط، فهي أكثر ما يتغيّر.',
    button: 'امسح مطبخي',
  },
};

export const NUDGE_COPY: Readonly<Record<EmailLocale, NudgeCopy>> = { en, es, he, ru, ar };
