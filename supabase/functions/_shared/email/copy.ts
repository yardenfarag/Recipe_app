// Every word Pinch emails say, in the five app languages. Placeholders in {braces} are filled
// by render.ts. Keep the tone of the app: warm, short, plain words, no jargon.

export const EMAIL_LOCALES = ['en', 'es', 'he', 'ru', 'ar'] as const;
export type EmailLocale = (typeof EMAIL_LOCALES)[number];

/** The app saves its language in user_metadata.locale; anything else falls back to English. */
export function pickLocale(value: unknown): EmailLocale {
  const code = typeof value === 'string' ? value.trim().toLowerCase().slice(0, 2) : '';
  return (EMAIL_LOCALES as readonly string[]).includes(code) ? (code as EmailLocale) : 'en';
}

export function isRtl(locale: EmailLocale): boolean {
  return locale === 'he' || locale === 'ar';
}

export interface Feature {
  emoji: string;
  title: string;
  body: string;
}

export interface EmailCopy {
  footerTagline: string;
  footerHelp: string;
  footerWhy: string;

  codeSubject: string;
  codePreheader: string;
  codeTitle: string;
  codeIntro: string;
  codeExpiry: string;
  codeIgnore: string;
  codeCopy: string;

  reauthSubject: string;
  reauthTitle: string;
  reauthIntro: string;

  resetSubject: string;
  resetPreheader: string;
  resetTitle: string;
  resetIntro: string;
  resetButtonIntro: string;
  resetButton: string;
  resetIgnore: string;

  changeSubject: string;
  changePreheader: string;
  changeTitle: string;
  changeIntro: string;
  changeButton: string;
  changeIgnore: string;

  welcomeSubject: string;
  welcomePreheader: string;
  welcomeTitle: string;
  welcomeIntro: string;
  welcomeFeaturesTitle: string;
  welcomeFeatures: Feature[];
  welcomeFreeTitle: string;
  welcomeFreeBody: string;
  welcomeButton: string;
  welcomeSignoff: string;

  purchaseSubject: string;
  purchasePreheader: string;
  purchaseTitle: string;
  purchaseIntro: string;
  purchaseCreditsAdded: string;
  purchaseBalance: string;
  purchaseVia: string;
  purchaseDate: string;
  purchaseReference: string;
  purchaseNever: string;
  purchaseReceipt: string;
  purchaseButton: string;
  stores: { app_store: string; play_store: string; paddle: string; polar: string; other: string };
}

const en: EmailCopy = {
  footerTagline: 'See it. Snap it. Cook it.',
  footerHelp: 'Questions? Just reply to this email, we read every one.',
  footerWhy: 'You got this email because of your Pinch account.',

  codeSubject: 'Your Pinch code: {code}',
  codePreheader: 'Type it in Pinch to sign in.',
  codeTitle: 'Here’s your sign-in code',
  codeIntro: 'Type this code in Pinch to sign in. No password needed.',
  codeExpiry: 'It works once and expires in an hour.',
  codeIgnore: 'Didn’t ask for a code? You can ignore this email. Nobody can sign in without it.',
  codeCopy: 'Copy code',

  reauthSubject: 'Your Pinch confirmation code: {code}',
  reauthTitle: 'Confirm it’s you',
  reauthIntro: 'Type this code in Pinch to confirm the change you’re making.',

  resetSubject: 'Reset your Pinch password',
  resetPreheader: 'Your code to choose a new password.',
  resetTitle: 'Let’s get you back in',
  resetIntro: 'Type this code in Pinch to choose a new password.',
  resetButtonIntro: 'Or tap the button to reset it in your browser:',
  resetButton: 'Choose a new password',
  resetIgnore: 'Didn’t ask to reset your password? Ignore this email and your password stays the same.',

  changeSubject: 'Confirm your new email for Pinch',
  changePreheader: 'One tap and your new address is set.',
  changeTitle: 'Confirm your new email',
  changeIntro: 'Tap the button to use this address for your Pinch account.',
  changeButton: 'Confirm email',
  changeIgnore: 'Didn’t ask for this? Ignore this email and nothing changes.',

  welcomeSubject: 'Welcome to Pinch 🍪',
  welcomePreheader: 'Your recipes from videos, ready to cook.',
  welcomeTitle: 'Welcome to Pinch!',
  welcomeIntro:
    'We’re so happy you’re here. Pinch turns the recipes you find in your feed into recipes you can actually cook. Here’s what you can do:',
  welcomeFeaturesTitle: 'What Pinch does',
  welcomeFeatures: [
    {
      emoji: '🎬',
      title: 'Save recipes from videos',
      body: 'Share a TikTok, Instagram Reel or YouTube video to Pinch. It watches, listens and reads the screen, then writes out the ingredients and steps.',
    },
    {
      emoji: '📸',
      title: 'Snap any recipe',
      body: 'Take a photo of a cookbook page or a handwritten card, or paste a recipe website link and skip the life story.',
    },
    {
      emoji: '🛒',
      title: 'One tap to a shopping list',
      body: 'Ingredients from several recipes merge into one list, grouped by aisle.',
    },
    {
      emoji: '👩‍🍳',
      title: 'Cook along',
      body: 'Step-by-step cook mode with timers, the video right beside the steps, and servings that scale.',
    },
    {
      emoji: '✨',
      title: 'Make it yours',
      body: 'Remix a recipe to be healthier or vegetarian, swap an ingredient, or snap your fridge to see what you can cook tonight.',
    },
  ],
  welcomeFreeTitle: '10 free recipes every month',
  welcomeFreeBody: 'No subscription. Need more? Credit packs never expire.',
  welcomeButton: 'Save your first recipe',
  welcomeSignoff: 'Happy cooking,\nThe Pinch team',

  purchaseSubject: 'Your {credits} Pinch credits are in 🎉',
  purchasePreheader: 'Thanks for your purchase. Your credits are ready to use.',
  purchaseTitle: 'Thank you! Your credits are in',
  purchaseIntro: 'We’ve added {credits} recipe credits to your account. Time to save some recipes.',
  purchaseCreditsAdded: 'Credits added',
  purchaseBalance: 'Your balance now',
  purchaseVia: 'Bought through',
  purchaseDate: 'Date',
  purchaseReference: 'Reference',
  purchaseNever: 'Credits never expire.',
  purchaseReceipt: 'Your payment receipt comes from {store}.',
  purchaseButton: 'Open Pinch',
  stores: { app_store: 'the App Store', play_store: 'Google Play', paddle: 'Paddle (pinch-app.io)', polar: 'Polar (pinch-app.io)', other: 'your store' },
};

const es: EmailCopy = {
  footerTagline: 'Míralo. Guárdalo. Cocínalo.',
  footerHelp: '¿Preguntas? Responde a este correo, leemos todos.',
  footerWhy: 'Recibes este correo por tu cuenta de Pinch.',

  codeSubject: 'Tu código de Pinch: {code}',
  codePreheader: 'Escríbelo en Pinch para iniciar sesión.',
  codeTitle: 'Aquí está tu código',
  codeIntro: 'Escribe este código en Pinch para iniciar sesión. Sin contraseña.',
  codeExpiry: 'Sirve una sola vez y caduca en una hora.',
  codeIgnore: '¿No pediste un código? Ignora este correo. Nadie puede entrar sin él.',
  codeCopy: 'Copiar código',

  reauthSubject: 'Tu código de confirmación de Pinch: {code}',
  reauthTitle: 'Confirma que eres tú',
  reauthIntro: 'Escribe este código en Pinch para confirmar el cambio.',

  resetSubject: 'Restablece tu contraseña de Pinch',
  resetPreheader: 'Tu código para elegir una contraseña nueva.',
  resetTitle: 'Vamos a recuperar tu cuenta',
  resetIntro: 'Escribe este código en Pinch para elegir una contraseña nueva.',
  resetButtonIntro: 'O toca el botón para hacerlo en tu navegador:',
  resetButton: 'Elegir contraseña nueva',
  resetIgnore: '¿No pediste esto? Ignora este correo y tu contraseña seguirá igual.',

  changeSubject: 'Confirma tu nuevo correo en Pinch',
  changePreheader: 'Un toque y tu nueva dirección queda lista.',
  changeTitle: 'Confirma tu nuevo correo',
  changeIntro: 'Toca el botón para usar esta dirección en tu cuenta de Pinch.',
  changeButton: 'Confirmar correo',
  changeIgnore: '¿No pediste esto? Ignora este correo y no cambiará nada.',

  welcomeSubject: 'Te damos la bienvenida a Pinch 🍪',
  welcomePreheader: 'Tus recetas de videos, listas para cocinar.',
  welcomeTitle: '¡Te damos la bienvenida a Pinch!',
  welcomeIntro:
    'Nos alegra mucho tenerte aquí. Pinch convierte las recetas que ves en tu feed en recetas que de verdad puedes cocinar. Esto es lo que puedes hacer:',
  welcomeFeaturesTitle: 'Lo que hace Pinch',
  welcomeFeatures: [
    {
      emoji: '🎬',
      title: 'Guarda recetas de videos',
      body: 'Comparte un TikTok, un Reel de Instagram o un video de YouTube con Pinch. Lo mira, lo escucha y lee la pantalla, y escribe los ingredientes y los pasos.',
    },
    {
      emoji: '📸',
      title: 'Fotografía cualquier receta',
      body: 'Haz una foto a la página de un libro o a una tarjeta escrita a mano, o pega el enlace de una web de recetas.',
    },
    {
      emoji: '🛒',
      title: 'Lista de la compra en un toque',
      body: 'Los ingredientes de varias recetas se juntan en una lista, ordenada por pasillo.',
    },
    {
      emoji: '👩‍🍳',
      title: 'Cocina paso a paso',
      body: 'Modo cocina con temporizadores, el video junto a los pasos y raciones que se ajustan.',
    },
    {
      emoji: '✨',
      title: 'Hazla tuya',
      body: 'Haz una receta más sana o vegetariana, cambia un ingrediente o fotografía tu nevera para ver qué cocinar hoy.',
    },
  ],
  welcomeFreeTitle: '10 recetas gratis cada mes',
  welcomeFreeBody: 'Sin suscripción. ¿Necesitas más? Los paquetes de créditos no caducan.',
  welcomeButton: 'Guarda tu primera receta',
  welcomeSignoff: '¡Feliz cocina!\nEl equipo de Pinch',

  purchaseSubject: 'Tus {credits} créditos de Pinch ya están aquí 🎉',
  purchasePreheader: 'Gracias por tu compra. Tus créditos ya están listos.',
  purchaseTitle: '¡Gracias! Tus créditos ya están aquí',
  purchaseIntro: 'Hemos añadido {credits} créditos de recetas a tu cuenta. ¡A guardar recetas!',
  purchaseCreditsAdded: 'Créditos añadidos',
  purchaseBalance: 'Tu saldo ahora',
  purchaseVia: 'Comprado en',
  purchaseDate: 'Fecha',
  purchaseReference: 'Referencia',
  purchaseNever: 'Los créditos no caducan.',
  purchaseReceipt: 'El recibo del pago te llega de {store}.',
  purchaseButton: 'Abrir Pinch',
  stores: { app_store: 'App Store', play_store: 'Google Play', paddle: 'Paddle (pinch-app.io)', polar: 'Polar (pinch-app.io)', other: 'tu tienda' },
};

const he: EmailCopy = {
  footerTagline: 'רואים. מצלמים. מבשלים.',
  footerHelp: 'שאלות? פשוט עונים למייל הזה, אנחנו קוראים כל אחד.',
  footerWhy: 'קיבלת את המייל הזה בגלל החשבון שלך ב-Pinch.',

  codeSubject: 'הקוד שלך ל-Pinch: {code}',
  codePreheader: 'מקלידים אותו ב-Pinch כדי להתחבר.',
  codeTitle: 'הנה קוד הכניסה שלך',
  codeIntro: 'מקלידים את הקוד הזה ב-Pinch ומתחברים. בלי סיסמה.',
  codeExpiry: 'הקוד עובד פעם אחת ותקף לשעה.',
  codeIgnore: 'לא ביקשת קוד? אפשר להתעלם מהמייל. אי אפשר להתחבר בלעדיו.',
  codeCopy: 'העתקת הקוד',

  reauthSubject: 'קוד האישור שלך ל-Pinch: {code}',
  reauthTitle: 'רק מוודאים שזה את/ה',
  reauthIntro: 'מקלידים את הקוד הזה ב-Pinch כדי לאשר את השינוי.',

  resetSubject: 'איפוס הסיסמה שלך ב-Pinch',
  resetPreheader: 'הקוד שלך לבחירת סיסמה חדשה.',
  resetTitle: 'בואו נחזיר אותך פנימה',
  resetIntro: 'מקלידים את הקוד הזה ב-Pinch ובוחרים סיסמה חדשה.',
  resetButtonIntro: 'או לוחצים על הכפתור כדי לאפס בדפדפן:',
  resetButton: 'בחירת סיסמה חדשה',
  resetIgnore: 'לא ביקשת לאפס סיסמה? אפשר להתעלם מהמייל והסיסמה תישאר כמו שהיא.',

  changeSubject: 'אישור כתובת המייל החדשה שלך ב-Pinch',
  changePreheader: 'לחיצה אחת והכתובת החדשה מוכנה.',
  changeTitle: 'אישור המייל החדש',
  changeIntro: 'לוחצים על הכפתור כדי להשתמש בכתובת הזו בחשבון ה-Pinch שלך.',
  changeButton: 'אישור המייל',
  changeIgnore: 'לא ביקשת את זה? אפשר להתעלם מהמייל ושום דבר לא ישתנה.',

  welcomeSubject: 'ברוכים הבאים ל-Pinch 🍪',
  welcomePreheader: 'המתכונים מהסרטונים שלך, מוכנים לבישול.',
  welcomeTitle: 'ברוכים הבאים ל-Pinch!',
  welcomeIntro:
    'כל כך שמחים שהצטרפת. Pinch הופכת את המתכונים שמופיעים לך בפיד למתכונים שאפשר באמת לבשל. הנה מה שאפשר לעשות:',
  welcomeFeaturesTitle: 'מה Pinch עושה',
  welcomeFeatures: [
    {
      emoji: '🎬',
      title: 'שומרים מתכונים מסרטונים',
      body: 'משתפים סרטון מטיקטוק, ריל מאינסטגרם או סרטון מיוטיוב ל-Pinch. היא צופה, מקשיבה וקוראת את הטקסט שעל המסך, וכותבת את המצרכים והשלבים.',
    },
    {
      emoji: '📸',
      title: 'מצלמים כל מתכון',
      body: 'מצלמים עמוד מספר בישול או כרטיס בכתב יד, או מדביקים קישור לאתר מתכונים ומדלגים על הסיפור.',
    },
    {
      emoji: '🛒',
      title: 'רשימת קניות בלחיצה',
      body: 'המצרכים מכמה מתכונים מתאחדים לרשימה אחת, מסודרת לפי מחלקות בסופר.',
    },
    {
      emoji: '👩‍🍳',
      title: 'מבשלים יחד',
      body: 'מצב בישול צעד אחר צעד עם טיימרים, הסרטון ליד השלבים, וכמויות שמתאימות את עצמן למספר המנות.',
    },
    {
      emoji: '✨',
      title: 'עושים את זה שלכם',
      body: 'הופכים מתכון לבריא יותר או לצמחוני, מחליפים מצרך, או מצלמים את המקרר ורואים מה אפשר לבשל הערב.',
    },
  ],
  welcomeFreeTitle: '10 מתכונים בחינם בכל חודש',
  welcomeFreeBody: 'בלי מנוי. צריך עוד? חבילות קרדיטים לא פגות לעולם.',
  welcomeButton: 'לשמור את המתכון הראשון',
  welcomeSignoff: 'בישול נעים,\nצוות Pinch',

  purchaseSubject: '{credits} הקרדיטים שלך ב-Pinch הגיעו 🎉',
  purchasePreheader: 'תודה על הרכישה. הקרדיטים מוכנים לשימוש.',
  purchaseTitle: 'תודה! הקרדיטים שלך הגיעו',
  purchaseIntro: 'הוספנו {credits} קרדיטים למתכונים לחשבון שלך. זה הזמן לשמור מתכונים.',
  purchaseCreditsAdded: 'קרדיטים שנוספו',
  purchaseBalance: 'היתרה שלך עכשיו',
  purchaseVia: 'נרכש דרך',
  purchaseDate: 'תאריך',
  purchaseReference: 'מספר אסמכתא',
  purchaseNever: 'הקרדיטים לא פגים לעולם.',
  purchaseReceipt: 'הקבלה על התשלום נשלחת מ-{store}.',
  purchaseButton: 'לפתוח את Pinch',
  stores: { app_store: 'App Store', play_store: 'Google Play', paddle: 'Paddle (pinch-app.io)', polar: 'Polar (pinch-app.io)', other: 'החנות' },
};

const ru: EmailCopy = {
  footerTagline: 'Увидел. Сохранил. Приготовил.',
  footerHelp: 'Есть вопросы? Просто ответьте на это письмо, мы читаем каждое.',
  footerWhy: 'Вы получили это письмо, потому что у вас есть аккаунт Pinch.',

  codeSubject: 'Ваш код Pinch: {code}',
  codePreheader: 'Введите его в Pinch, чтобы войти.',
  codeTitle: 'Ваш код для входа',
  codeIntro: 'Введите этот код в Pinch, чтобы войти. Пароль не нужен.',
  codeExpiry: 'Код одноразовый и действует один час.',
  codeIgnore: 'Не запрашивали код? Просто проигнорируйте это письмо. Без кода никто не войдёт.',
  codeCopy: 'Скопировать код',

  reauthSubject: 'Ваш код подтверждения Pinch: {code}',
  reauthTitle: 'Подтвердите, что это вы',
  reauthIntro: 'Введите этот код в Pinch, чтобы подтвердить изменение.',

  resetSubject: 'Сброс пароля Pinch',
  resetPreheader: 'Ваш код для нового пароля.',
  resetTitle: 'Давайте вернём доступ',
  resetIntro: 'Введите этот код в Pinch, чтобы выбрать новый пароль.',
  resetButtonIntro: 'Или нажмите кнопку, чтобы сделать это в браузере:',
  resetButton: 'Выбрать новый пароль',
  resetIgnore: 'Не запрашивали сброс? Проигнорируйте письмо, и пароль останется прежним.',

  changeSubject: 'Подтвердите новый адрес почты в Pinch',
  changePreheader: 'Одно нажатие, и новый адрес готов.',
  changeTitle: 'Подтвердите новую почту',
  changeIntro: 'Нажмите кнопку, чтобы использовать этот адрес в аккаунте Pinch.',
  changeButton: 'Подтвердить почту',
  changeIgnore: 'Не запрашивали это? Проигнорируйте письмо, ничего не изменится.',

  welcomeSubject: 'Добро пожаловать в Pinch 🍪',
  welcomePreheader: 'Рецепты из видео, готовые к готовке.',
  welcomeTitle: 'Добро пожаловать в Pinch!',
  welcomeIntro:
    'Мы очень рады, что вы с нами. Pinch превращает рецепты из вашей ленты в рецепты, по которым действительно можно готовить. Вот что можно делать:',
  welcomeFeaturesTitle: 'Что умеет Pinch',
  welcomeFeatures: [
    {
      emoji: '🎬',
      title: 'Сохраняйте рецепты из видео',
      body: 'Поделитесь видео из TikTok, Instagram Reels или YouTube с Pinch. Он смотрит, слушает и читает текст на экране, а затем записывает ингредиенты и шаги.',
    },
    {
      emoji: '📸',
      title: 'Фотографируйте любые рецепты',
      body: 'Сфотографируйте страницу кулинарной книги или карточку, написанную от руки, или вставьте ссылку на сайт с рецептом.',
    },
    {
      emoji: '🛒',
      title: 'Список покупок в одно касание',
      body: 'Ингредиенты из нескольких рецептов объединяются в один список, разбитый по отделам магазина.',
    },
    {
      emoji: '👩‍🍳',
      title: 'Готовьте шаг за шагом',
      body: 'Режим готовки с таймерами, видео рядом с шагами и порции, которые пересчитываются сами.',
    },
    {
      emoji: '✨',
      title: 'Делайте по-своему',
      body: 'Сделайте рецепт полезнее или вегетарианским, замените ингредиент или сфотографируйте холодильник и узнайте, что приготовить сегодня.',
    },
  ],
  welcomeFreeTitle: '10 бесплатных рецептов каждый месяц',
  welcomeFreeBody: 'Без подписки. Нужно больше? Пакеты кредитов не сгорают.',
  welcomeButton: 'Сохранить первый рецепт',
  welcomeSignoff: 'Приятной готовки,\nКоманда Pinch',

  purchaseSubject: 'Ваши {credits} кредитов Pinch уже на счёте 🎉',
  purchasePreheader: 'Спасибо за покупку. Кредиты уже можно использовать.',
  purchaseTitle: 'Спасибо! Кредиты зачислены',
  purchaseIntro: 'Мы добавили {credits} кредитов на рецепты в ваш аккаунт. Самое время сохранить пару рецептов.',
  purchaseCreditsAdded: 'Добавлено кредитов',
  purchaseBalance: 'Ваш баланс',
  purchaseVia: 'Куплено через',
  purchaseDate: 'Дата',
  purchaseReference: 'Номер',
  purchaseNever: 'Кредиты не сгорают.',
  purchaseReceipt: 'Чек об оплате придёт от {store}.',
  purchaseButton: 'Открыть Pinch',
  stores: { app_store: 'App Store', play_store: 'Google Play', paddle: 'Paddle (pinch-app.io)', polar: 'Polar (pinch-app.io)', other: 'магазина' },
};

const ar: EmailCopy = {
  footerTagline: 'شاهِد. صوِّر. اطبخ.',
  footerHelp: 'لديك سؤال؟ فقط رُدّ على هذه الرسالة، نقرأ كل رسالة.',
  footerWhy: 'وصلتك هذه الرسالة بسبب حسابك في Pinch.',

  codeSubject: 'رمزك في Pinch: {code}',
  codePreheader: 'اكتبه في Pinch لتسجيل الدخول.',
  codeTitle: 'هذا رمز تسجيل الدخول',
  codeIntro: 'اكتب هذا الرمز في Pinch لتسجيل الدخول. لا حاجة لكلمة مرور.',
  codeExpiry: 'يعمل مرة واحدة وتنتهي صلاحيته خلال ساعة.',
  codeIgnore: 'لم تطلب رمزًا؟ يمكنك تجاهل هذه الرسالة. لا أحد يستطيع الدخول بدونه.',
  codeCopy: 'نسخ الرمز',

  reauthSubject: 'رمز التأكيد في Pinch: {code}',
  reauthTitle: 'تأكيد أنه أنت',
  reauthIntro: 'اكتب هذا الرمز في Pinch لتأكيد التغيير.',

  resetSubject: 'إعادة تعيين كلمة مرور Pinch',
  resetPreheader: 'رمزك لاختيار كلمة مرور جديدة.',
  resetTitle: 'لنُعِدك إلى حسابك',
  resetIntro: 'اكتب هذا الرمز في Pinch لاختيار كلمة مرور جديدة.',
  resetButtonIntro: 'أو اضغط الزر لإعادة تعيينها في المتصفح:',
  resetButton: 'اختيار كلمة مرور جديدة',
  resetIgnore: 'لم تطلب ذلك؟ تجاهل هذه الرسالة وستبقى كلمة المرور كما هي.',

  changeSubject: 'تأكيد بريدك الجديد في Pinch',
  changePreheader: 'ضغطة واحدة ويصبح عنوانك الجديد جاهزًا.',
  changeTitle: 'تأكيد البريد الجديد',
  changeIntro: 'اضغط الزر لاستخدام هذا العنوان في حسابك على Pinch.',
  changeButton: 'تأكيد البريد',
  changeIgnore: 'لم تطلب ذلك؟ تجاهل هذه الرسالة ولن يتغير شيء.',

  welcomeSubject: 'أهلًا بك في Pinch 🍪',
  welcomePreheader: 'وصفاتك من الفيديوهات، جاهزة للطبخ.',
  welcomeTitle: 'أهلًا بك في Pinch!',
  welcomeIntro:
    'سعداء جدًا بانضمامك. يحوّل Pinch الوصفات التي تراها في صفحتك إلى وصفات يمكنك طبخها فعلًا. إليك ما يمكنك فعله:',
  welcomeFeaturesTitle: 'ماذا يفعل Pinch',
  welcomeFeatures: [
    {
      emoji: '🎬',
      title: 'احفظ الوصفات من الفيديوهات',
      body: 'شارك فيديو من تيك توك أو ريلز إنستغرام أو يوتيوب مع Pinch. يشاهده ويستمع إليه ويقرأ النص على الشاشة، ثم يكتب المكونات والخطوات.',
    },
    {
      emoji: '📸',
      title: 'صوّر أي وصفة',
      body: 'صوّر صفحة من كتاب طبخ أو بطاقة مكتوبة بخط اليد، أو الصق رابط موقع وصفات.',
    },
    {
      emoji: '🛒',
      title: 'قائمة تسوق بضغطة واحدة',
      body: 'تجتمع مكونات عدة وصفات في قائمة واحدة مرتبة حسب أقسام المتجر.',
    },
    {
      emoji: '👩‍🍳',
      title: 'اطبخ خطوة بخطوة',
      body: 'وضع الطبخ مع مؤقتات، والفيديو بجانب الخطوات، وكميات تتغير حسب عدد الحصص.',
    },
    {
      emoji: '✨',
      title: 'اجعلها على ذوقك',
      body: 'اجعل الوصفة صحية أكثر أو نباتية، أو بدّل مكوّنًا، أو صوّر ثلاجتك لترى ما يمكنك طبخه الليلة.',
    },
  ],
  welcomeFreeTitle: '10 وصفات مجانية كل شهر',
  welcomeFreeBody: 'بدون اشتراك. تحتاج المزيد؟ باقات الرصيد لا تنتهي صلاحيتها.',
  welcomeButton: 'احفظ وصفتك الأولى',
  welcomeSignoff: 'طبخًا شهيًا،\nفريق Pinch',

  purchaseSubject: 'وصل رصيدك في Pinch: {credits} 🎉',
  purchasePreheader: 'شكرًا لشرائك. رصيدك جاهز للاستخدام.',
  purchaseTitle: 'شكرًا لك! وصل رصيدك',
  purchaseIntro: 'أضفنا {credits} من رصيد الوصفات إلى حسابك. حان وقت حفظ بعض الوصفات.',
  purchaseCreditsAdded: 'الرصيد المضاف',
  purchaseBalance: 'رصيدك الآن',
  purchaseVia: 'تم الشراء عبر',
  purchaseDate: 'التاريخ',
  purchaseReference: 'المرجع',
  purchaseNever: 'الرصيد لا تنتهي صلاحيته.',
  purchaseReceipt: 'يصلك إيصال الدفع من {store}.',
  purchaseButton: 'افتح Pinch',
  stores: { app_store: 'App Store', play_store: 'Google Play', paddle: 'Paddle (pinch-app.io)', polar: 'Polar (pinch-app.io)', other: 'المتجر' },
};

export const COPY: Readonly<Record<EmailLocale, EmailCopy>> = { en, es, he, ru, ar };

/** Fills {name} placeholders. Unknown names stay as they are, so a typo shows up in tests. */
export function fill(template: string, values: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}
