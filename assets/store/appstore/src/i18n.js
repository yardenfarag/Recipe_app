// Localized store screenshots. screenshots.html stays written in English; with #lang=he|ar|es|ru this
// script swaps each English string for its translation, loads fonts that cover the script and, for Hebrew and
// Arabic, flips every frame right-to-left. Keys are the English text exactly as it appears in the page (an element's
// innerHTML, or a single text node). Add #check=1 to outline any English text that is still showing.
(() => {
  const STRINGS = {
    he: {
      // frame 1: hook
      'Pinch · Recipe keeper': 'Pinch · ספריית מתכונים',
      "Saw it on TikTok?<br><em>Now it's dinner.</em>": 'ראיתם בטיקטוק?<br><em>הנה ארוחת הערב.</em>',
      '15-min lemon garlic pasta — you NEED this': 'פסטה לימון ושום ב־15 דק׳ — חייבים לנסות',
      'Saved to Pinch': 'נשמר ב־Pinch',
      'Lemon garlic pasta': 'פסטה לימון ושום',
      '25 min': '25 דק׳',
      Easy: 'קל',
      'Serves 4': '4 מנות',
      spaghetti: 'ספגטי',
      '400 g': '400 גר׳',
      'garlic cloves': 'שיני שום',
      lemon: 'לימון',
      parmesan: 'פרמזן',
      '40 g': '40 גר׳',
      'Any recipe site': 'כל אתר מתכונים',
      // frame 2: reads the whole video
      'Smart extraction': 'שליפה חכמה',
      'Reads the<br>whole video.': 'קורא את<br>כל הסרטון.',
      'Not just the caption. Every pinch, splash and sneaky “just a bit more”.':
        'לא רק את הכיתוב. כל קורט, כל שפריץ וכל ״עוד קצת״ שנזרק בדרך.',
      'Snap a recipe': 'שליפת מתכון',
      'Weeknight shakshuka': 'שקשוקה של אמצע השבוע',
      'Watching the video… 72%': 'צופה בסרטון… 72%',
      'Found so far': 'מה מצאנו עד עכשיו',
      'crushed tomatoes': 'עגבניות מרוסקות',
      '800 g': '800 גר׳',
      eggs: 'ביצים',
      'smoked paprika': 'פפריקה מעושנת',
      '1 tsp': '1 כפית',
      'Heard at 2:41': 'נשמע ב־2:41',
      '“…and a good<br>pinch of cumin”': '״…וקורט נדיב<br>של כמון״',
      '+ 1 tsp cumin': '+ 1 כפית כמון',
      // frame 3: make it yours
      'Your kitchen, your rules': 'המטבח שלכם, הכללים שלכם',
      'Scale it.<br>Swap it.<br><em>Remix it.</em>': 'מגדילים.<br>מחליפים.<br><em>עושים רימיקס.</em>',
      Servings: 'מנות',
      'Everything recalculates': 'הכמויות מתעדכנות לבד',
      'was 4': 'קודם: 4',
      Swap: 'החלפה',
      'out of butter?': 'נגמרה החמאה?',
      butter: 'חמאה',
      'olive oil': 'שמן זית',
      'Use ¾ the amount · 3 tbsp': '¾ מהכמות · 3 כפות',
      'Remix: make it vegan': 'רימיקס: גרסה טבעונית',
      'Gluten-free': 'בלי גלוטן',
      Vegetarian: 'צמחוני',
      Healthier: 'בריא יותר',
      Translate: 'תרגום',
      'EN · ES · HE · AR · RU': 'HE · AR · EN · ES · RU',
      // frame 4: shopping list
      'Shopping list': 'רשימת קניות',
      'The list<br><em>writes itself.</em>': 'הרשימה<br><em>כותבת את עצמה.</em>',
      'Add a recipe, get the groceries. Check things off in the aisle.':
        'מוסיפים מתכון, מקבלים רשימת קניות. מסמנים תוך כדי הליכה בסופר.',
      List: 'רשימה',
      '5 LEFT · 2 CHECKED': '5 נשארו · 2 סומנו',
      'dark chocolate': 'שוקולד מריר',
      '200 g': '200 גר׳',
      garlic: 'שום',
      '1 head': 'ראש אחד',
      lemons: 'לימונים',
      tahini: 'טחינה',
      '1 jar': 'צנצנת אחת',
      cucumbers: 'מלפפונים',
      '7 items added': 'נוספו 7 פריטים',
      'from 2 recipes': 'מ־2 מתכונים',
      // frame 5: cook along
      'Cook along': 'מבשלים יחד',
      'No more<br><em>pause, rewind,</em><br>pause.': 'בלי<br><em>עצור, אחורה,</em><br>עצור.',
      'Clear steps you can follow. Tap a step to jump to that moment in the video.':
        'שלבים ברורים שקל לעקוב אחריהם. נגיעה בשלב קופצת לרגע הזה בסרטון.',
      'Boil the spaghetti in well salted water until al dente.': 'מבשלים את הספגטי במים מומלחים היטב עד אל דנטה.',
      'Gently fry the garlic in olive oil until fragrant, not brown.':
        'מטגנים בעדינות את השום בשמן זית עד שעולה ריח, בלי שישחים.',
      'Toss with lemon zest, juice, parmesan and a splash of pasta water.':
        'מערבבים עם גרידת לימון, מיץ לימון, פרמזן ומעט ממי הפסטה.',
      'Screen stays on while you cook': 'המסך נשאר דלוק בזמן הבישול',
      // frame 6: library
      'Your library': 'הספרייה שלכם',
      'Every recipe<br>you loved,<br><em>in one place.</em>': 'כל מתכון<br>שאהבתם,<br><em>במקום אחד.</em>',
      'Chewy chocolate cookies': 'עוגיות שוקולד רכות',
      'Weeknight miso ramen': 'ראמן מיסו מהיר',
      'Sesame cucumber salad': 'סלט מלפפונים ושומשום',
      '40 min · Easy': '40 דק׳ · קל',
      '25 min · Easy': '25 דק׳ · קל',
      '30 min · Easy': '30 דק׳ · קל',
      '15 min · Easy': '15 דק׳ · קל',
      'Free recipes every month. No subscription.': 'מתכונים בחינם כל חודש. בלי מנוי.',
    },
    ar: {
      // frame 1: hook
      'Pinch · Recipe keeper': 'Pinch · وصفات من الفيديو',
      "Saw it on TikTok?<br><em>Now it's dinner.</em>": 'شاهدتها على<br>تيك توك؟<br><em>صارت عشاءك.</em>',
      '15-min lemon garlic pasta — you NEED this': 'باستا الليمون والثوم في 15 دقيقة',
      'Saved to Pinch': 'حُفظت في Pinch',
      'Lemon garlic pasta': 'باستا بالليمون والثوم',
      '25 min': '25 د',
      Easy: 'سهل',
      'Serves 4': '4 حصص',
      spaghetti: 'سباغيتي',
      '400 g': '400 جم',
      'garlic cloves': 'فصوص ثوم',
      lemon: 'ليمون',
      parmesan: 'بارميزان',
      '40 g': '40 جم',
      'Any recipe site': 'أي موقع وصفات',
      // frame 2: reads the whole video
      'Smart extraction': 'استخراج ذكي',
      'Reads the<br>whole video.': 'يقرأ الفيديو<br>كاملًا.',
      'Not just the caption. Every pinch, splash and sneaky “just a bit more”.':
        'لا يكتفي بالوصف. يلتقط كل رشّة وكل قطرة وكل «رشّة إضافية».',
      'Snap a recipe': 'أضف وصفة من رابط',
      'Weeknight shakshuka': 'شكشوكة سريعة',
      'Watching the video… 72%': 'يشاهد الفيديو… 72%',
      'Found so far': 'ما وجدناه حتى الآن',
      'crushed tomatoes': 'طماطم مهروسة',
      '800 g': '800 جم',
      eggs: 'بيض',
      'smoked paprika': 'بابريكا مدخّنة',
      '1 tsp': 'ملعقة صغيرة',
      'Heard at 2:41': 'سُمع عند الدقيقة 2:41',
      '“…and a good<br>pinch of cumin”': '«…ورشّة سخية<br>من الكمّون»',
      '+ 1 tsp cumin': '+ ملعقة صغيرة كمّون',
      // frame 3: make it yours
      'Your kitchen, your rules': 'مطبخك، قواعدك',
      'Scale it.<br>Swap it.<br><em>Remix it.</em>': 'كبّرها.<br>بدّلها.<br><em>اصنع ريميكس.</em>',
      Servings: 'حصص',
      'Everything recalculates': 'تُحسب الكميات من جديد',
      'was 4': 'كانت 4',
      Swap: 'تبديل',
      'out of butter?': 'نفدت الزبدة؟',
      butter: 'زبدة',
      'olive oil': 'زيت زيتون',
      'Use ¾ the amount · 3 tbsp': 'استخدم ¾ الكمية · 3 ملاعق كبيرة',
      'Remix: make it vegan': 'ريميكس: نسخة نباتية بالكامل',
      'Gluten-free': 'بدون غلوتين',
      Vegetarian: 'نباتي',
      Healthier: 'أكثر صحة',
      Translate: 'ترجمة',
      'EN · ES · HE · AR · RU': 'AR · EN · ES · RU',
      // frame 4: shopping list
      'Shopping list': 'قائمة التسوّق',
      'The list<br><em>writes itself.</em>': 'القائمة<br><em>تكتب نفسها.</em>',
      'Add a recipe, get the groceries. Check things off in the aisle.':
        'أضف وصفة واحصل على قائمة التسوّق. علّم عليها وأنت تتسوّق.',
      List: 'القائمة',
      '5 LEFT · 2 CHECKED': '5 متبقية · 2 تم شراؤها',
      'dark chocolate': 'شوكولاتة داكنة',
      '200 g': '200 جم',
      garlic: 'ثوم',
      '1 head': 'رأس واحد',
      lemons: 'ليمون',
      tahini: 'طحينة',
      '1 jar': 'علبة واحدة',
      cucumbers: 'خيار',
      '7 items added': 'تمت إضافة 7 أصناف',
      'from 2 recipes': 'من وصفتين',
      // frame 5: cook along
      'Cook along': 'اطبخ مع الفيديو',
      'No more<br><em>pause, rewind,</em><br>pause.': 'وداعًا<br><em>للإيقاف</em><br>والإرجاع.',
      'Clear steps you can follow. Tap a step to jump to that moment in the video.':
        'خطوات واضحة وسهلة. اضغط على أي خطوة لتنتقل إلى لحظتها في الفيديو.',
      'Boil the spaghetti in well salted water until al dente.': 'اسلق السباغيتي في ماء مملّح جيدًا حتى تنضج وتبقى متماسكة قليلًا.',
      'Gently fry the garlic in olive oil until fragrant, not brown.':
        'قلّب الثوم بلطف في زيت الزيتون حتى تفوح رائحته، دون أن يحمرّ.',
      'Toss with lemon zest, juice, parmesan and a splash of pasta water.':
        'قلّبها مع بشر الليمون وعصيره والبارميزان وقليل من ماء سلق المعكرونة.',
      'Screen stays on while you cook': 'تبقى الشاشة مضاءة أثناء الطبخ',
      // frame 6: library
      'Your library': 'مكتبتك',
      'Every recipe<br>you loved,<br><em>in one place.</em>': 'كل وصفة<br>أحببتها،<br><em>في مكان واحد.</em>',
      'Chewy chocolate cookies': 'كوكيز الشوكولاتة الطرية',
      'Weeknight miso ramen': 'رامن الميسو السريع',
      'Sesame cucumber salad': 'سلطة الخيار بالسمسم',
      '40 min · Easy': '40 د · سهل',
      '25 min · Easy': '25 د · سهل',
      '30 min · Easy': '30 د · سهل',
      '15 min · Easy': '15 د · سهل',
      'Free recipes every month. No subscription.': 'وصفات مجانية كل شهر. بلا اشتراك.',
    },
    es: {
      // frame 1: hook
      'Pinch · Recipe keeper': 'Pinch · Recetario',
      "Saw it on TikTok?<br><em>Now it's dinner.</em>": '¿Lo viste en TikTok?<br><em>Ya es la cena.</em>',
      '15-min lemon garlic pasta — you NEED this': 'Pasta de limón y ajo en 15 min — TIENES que probarla',
      'Saved to Pinch': 'Guardada en Pinch',
      'Lemon garlic pasta': 'Pasta de limón y&nbsp;ajo',
      '25 min': '25 min',
      Easy: 'Fácil',
      'Serves 4': '4 porciones',
      spaghetti: 'espagueti',
      '400 g': '400 g',
      'garlic cloves': 'dientes de ajo',
      lemon: 'limón',
      parmesan: 'parmesano',
      '40 g': '40 g',
      'Any recipe site': 'Cualquier sitio de recetas',
      // frame 2: reads the whole video
      'Smart extraction': 'Extracción inteligente',
      'Reads the<br>whole video.': 'Lee todo<br>el video.',
      'Not just the caption. Every pinch, splash and sneaky “just a bit more”.':
        'No solo la descripción. Cada pizca, cada chorrito y cada “un poquito más”.',
      'Snap a recipe': 'Sacar una receta',
      'Weeknight shakshuka': 'Shakshuka rápida',
      'Watching the video… 72%': 'Viendo el video… 72%',
      'Found so far': 'Encontrado hasta ahora',
      'crushed tomatoes': 'puré de tomate',
      '800 g': '800 g',
      eggs: 'huevos',
      'smoked paprika': 'paprika ahumada',
      '1 tsp': '1 cdta',
      'Heard at 2:41': 'Se oye en el minuto 2:41',
      '“…and a good<br>pinch of cumin”': '“…y una buena<br>pizca de comino”',
      '+ 1 tsp cumin': '+ 1 cdta de comino',
      // frame 3: make it yours
      'Your kitchen, your rules': 'Tu cocina, tus reglas',
      'Scale it.<br>Swap it.<br><em>Remix it.</em>': 'Ajústala.<br>Cámbiala.<br><em>Hazle un remix.</em>',
      Servings: 'Porciones',
      'Everything recalculates': 'Todo se recalcula',
      'was 4': 'antes 4',
      Swap: 'Cambiar',
      'out of butter?': '¿sin mantequilla?',
      butter: 'mantequilla',
      'olive oil': 'aceite de oliva',
      'Use ¾ the amount · 3 tbsp': 'Usa ¾ de la cantidad · 3 cdas',
      'Remix: make it vegan': 'Remix: versión vegana',
      'Gluten-free': 'Sin gluten',
      Vegetarian: 'Vegetariana',
      Healthier: 'Más sana',
      Translate: 'Traducir',
      'EN · ES · HE · AR · RU': 'ES · EN · RU · HE · AR',
      // frame 4: shopping list
      'Shopping list': 'Lista de compras',
      'The list<br><em>writes itself.</em>': 'La lista<br><em>se hace sola.</em>',
      'Add a recipe, get the groceries. Check things off in the aisle.':
        'Agrega una receta y ya sabes qué comprar. Márcalo en el pasillo.',
      List: 'Lista',
      '5 LEFT · 2 CHECKED': '5 PENDIENTES · 2 MARCADOS',
      'dark chocolate': 'chocolate amargo',
      '200 g': '200 g',
      garlic: 'ajo',
      '1 head': '1 cabeza',
      lemons: 'limones',
      tahini: 'tahini',
      '1 jar': '1 frasco',
      cucumbers: 'pepinos',
      '7 items added': '7 productos agregados',
      'from 2 recipes': 'de 2 recetas',
      // frame 5: cook along
      'Cook along': 'Cocina con el video',
      'No more<br><em>pause, rewind,</em><br>pause.': 'Se acabó<br><em>pausar, retroceder,</em><br>pausar.',
      'Clear steps you can follow. Tap a step to jump to that moment in the video.':
        'Pasos claros y fáciles de seguir. Toca un paso para saltar a ese momento del video.',
      'Boil the spaghetti in well salted water until al dente.':
        'Cocina el espagueti en agua con bastante sal hasta que esté al dente.',
      'Gently fry the garlic in olive oil until fragrant, not brown.':
        'Sofríe el ajo a fuego suave en aceite de oliva hasta que suelte su aroma, sin que se dore.',
      'Toss with lemon zest, juice, parmesan and a splash of pasta water.':
        'Mezcla con ralladura y jugo de limón, parmesano y un chorrito del agua de la pasta.',
      'Screen stays on while you cook': 'La pantalla no se apaga mientras cocinas',
      // frame 6: library
      'Your library': 'Tu recetario',
      'Every recipe<br>you loved,<br><em>in one place.</em>': 'Cada receta<br>que te encantó,<br><em>en un solo lugar.</em>',
      'Chewy chocolate cookies': 'Galletas suaves de chocolate',
      'Weeknight miso ramen': 'Ramen de miso rápido',
      'Sesame cucumber salad': 'Ensalada de pepino y sésamo',
      '40 min · Easy': '40 min · Fácil',
      '25 min · Easy': '25 min · Fácil',
      '30 min · Easy': '30 min · Fácil',
      '15 min · Easy': '15 min · Fácil',
      'Free recipes every month. No subscription.': 'Recetas gratis cada mes. Sin suscripción.',
    },
    ru: {
      // frame 1: hook
      'Pinch · Recipe keeper': 'Pinch · Книга рецептов',
      "Saw it on TikTok?<br><em>Now it's dinner.</em>": 'Увидели<br>в&nbsp;TikTok?<br><em>Вот и ужин.</em>',
      '15-min lemon garlic pasta — you NEED this': 'Паста с лимоном и чесноком за 15 минут — это надо попробовать!',
      'Saved to Pinch': 'Сохранено в Pinch',
      'Lemon garlic pasta': 'Паста с лимоном и&nbsp;чесноком',
      '25 min': '25 мин',
      Easy: 'Легко',
      'Serves 4': '4 порции',
      spaghetti: 'спагетти',
      '400 g': '400 г',
      'garlic cloves': 'зубчики чеснока',
      lemon: 'лимон',
      parmesan: 'пармезан',
      '40 g': '40 г',
      'Any recipe site': 'Любой сайт с рецептами',
      // frame 2: reads the whole video
      'Smart extraction': 'Умный разбор видео',
      'Reads the<br>whole video.': 'Смотрит видео<br>целиком.',
      'Not just the caption. Every pinch, splash and sneaky “just a bit more”.':
        'Не только описание. Каждую щепотку, каждую каплю и каждое «ещё чуть-чуть».',
      'Snap a recipe': 'Забрать рецепт',
      'Weeknight shakshuka': 'Быстрая шакшука',
      'Watching the video… 72%': 'Смотрим видео… 72%',
      'Found so far': 'Уже нашли',
      'crushed tomatoes': 'протёртые томаты',
      '800 g': '800 г',
      eggs: 'яйца',
      'smoked paprika': 'копчёная паприка',
      '1 tsp': '1 ч. л.',
      'Heard at 2:41': 'Слышно на 2:41',
      '“…and a good<br>pinch of cumin”': '«…и хорошую<br>щепотку зиры»',
      '+ 1 tsp cumin': '+ 1 ч. л. зиры',
      // frame 3: make it yours
      'Your kitchen, your rules': 'Ваша кухня, ваши правила',
      'Scale it.<br>Swap it.<br><em>Remix it.</em>': 'Пересчитайте.<br>Замените.<br><em>Сделайте ремикс.</em>',
      Servings: 'Порции',
      'Everything recalculates': 'Всё пересчитается само',
      'was 4': 'было 4',
      Swap: 'Замена',
      'out of butter?': 'нет сливочного?',
      butter: 'сливочное',
      'olive oil': 'оливковое',
      'Use ¾ the amount · 3 tbsp': '¾ от нормы · 3 ст. л.',
      'Remix: make it vegan': 'Ремикс: веганская версия',
      'Gluten-free': 'Без глютена',
      Vegetarian: 'Вегетарианский',
      Healthier: 'Полезнее',
      Translate: 'Перевод',
      'EN · ES · HE · AR · RU': 'RU · EN · ES · HE · AR',
      // frame 4: shopping list
      'Shopping list': 'Список покупок',
      'The list<br><em>writes itself.</em>': 'Список<br><em>соберётся сам.</em>',
      'Add a recipe, get the groceries. Check things off in the aisle.':
        'Добавьте рецепт, и список покупок готов. Отмечайте прямо в магазине.',
      List: 'Список',
      '5 LEFT · 2 CHECKED': 'ОСТАЛОСЬ 5 · ОТМЕЧЕНО 2',
      'dark chocolate': 'тёмный шоколад',
      '200 g': '200 г',
      garlic: 'чеснок',
      '1 head': '1 головка',
      lemons: 'лимоны',
      tahini: 'тахини',
      '1 jar': '1 банка',
      cucumbers: 'огурцы',
      '7 items added': 'Добавлено 7 продуктов',
      'from 2 recipes': 'из 2 рецептов',
      // frame 5: cook along
      'Cook along': 'Готовим по видео',
      'No more<br><em>pause, rewind,</em><br>pause.': 'Больше никаких<br><em>пауз и перемоток.</em>',
      'Clear steps you can follow. Tap a step to jump to that moment in the video.':
        'Понятные шаги. Нажмите на шаг, и видео перейдёт к этому моменту.',
      'Boil the spaghetti in well salted water until al dente.':
        'Отварите спагетти в хорошо подсоленной воде до состояния аль денте.',
      'Gently fry the garlic in olive oil until fragrant, not brown.':
        'Слегка обжарьте чеснок в оливковом масле до появления аромата, не давая ему потемнеть.',
      'Toss with lemon zest, juice, parmesan and a splash of pasta water.':
        'Перемешайте с цедрой и соком лимона, пармезаном и парой ложек воды от пасты.',
      'Screen stays on while you cook': 'Экран не гаснет, пока вы готовите',
      // frame 6: library
      'Your library': 'Ваша библиотека',
      'Every recipe<br>you loved,<br><em>in one place.</em>': 'Все любимые<br>рецепты<br><em>в одном месте.</em>',
      'Chewy chocolate cookies': 'Мягкое шоколадное печенье',
      'Weeknight miso ramen': 'Быстрый мисо-рамен',
      'Sesame cucumber salad': 'Салат из огурцов с&nbsp;кунжутом',
      '40 min · Easy': '40 мин · Легко',
      '25 min · Easy': '25 мин · Легко',
      '30 min · Easy': '30 мин · Легко',
      '15 min · Easy': '15 мин · Легко',
      'Free recipes every month. No subscription.': 'Бесплатные рецепты каждый месяц. Без подписки.',
    },
  };

  // Google Fonts with the right script: `serif` is the headline face, `sans` everything else.
  const FONTS = {
    he: { sans: 'Rubik', serif: 'Rubik', css: 'family=Rubik:wght@400;500;600;700;800' },
    ar: { sans: 'Tajawal', serif: 'Cairo', css: 'family=Tajawal:wght@400;500;700;800&family=Cairo:wght@600;700;800' },
    // Close to the English design (New York headlines, SF text), with Cyrillic, and the same on every machine
    es: { sans: 'Inter', serif: 'Lora', css: 'family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,600;0,700;1,600' },
    ru: { sans: 'Inter', serif: 'Lora', css: 'family=Inter:wght@400;500;600;700&family=Lora:ital,wght@0,600;0,700;1,600' },
  };

  // Text that stays as-is in every language: brand names, handles, URLs, times.
  const KEEP = /^(Pinch|TikTok|Instagram|YouTube|Snap|@lena\.cooks|youtube\.com · 6:12|9:41|[A-Z]{2}( · [A-Z]{2})+|[\d\s:·%+−]*)$/;

  const params = new URLSearchParams(location.hash.slice(1));
  const lang = params.get('lang') || 'en';
  if (!STRINGS[lang]) return;
  const dict = STRINGS[lang];
  const font = FONTS[lang];
  const rtl = lang === 'he' || lang === 'ar';

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${font.css}&display=block`;
  document.head.appendChild(link);

  const style = document.createElement('style');
  style.textContent = `
    :root { --sans: "${font.sans}", sans-serif; --serif: "${font.serif}", "${font.sans}", serif; }
    .untranslated { outline: 6px solid red !important; }
  ` + (rtl ? `
    /* Hebrew and Arabic have no italics, and letter-spacing breaks Arabic joining */
    .headline em, [style*="italic"] { font-style: normal !important; }
    .headline em { font-weight: 700; }
    .headline, .eyebrow, .pill, [style*="letter-spacing"] { letter-spacing: 0 !important; }
    .headline { line-height: 1.12; }
    .flip-rtl { transform: scaleX(-1); }
  ` : '');
  document.head.appendChild(style);
  document.documentElement.lang = lang;

  // Whole elements first, so headlines keep their <br> and <em>; then any loose text nodes.
  for (const el of document.querySelectorAll('#stage *')) {
    const key = el.innerHTML.trim();
    if (dict[key] === undefined) continue;
    el.innerHTML = dict[key];
    el.dataset.i18n = '';
  }
  const walker = document.createTreeWalker(document.getElementById('stage'), NodeFilter.SHOW_TEXT);
  const missing = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim();
    if (!text) continue;
    if (dict[text] !== undefined) node.nodeValue = node.nodeValue.replace(text, dict[text]);
    // Inside an element translated above, or already in Hebrew/Arabic, or nothing to translate
    else if (node.parentElement.closest('[data-i18n]')) continue;
    else if (/[A-Za-z]/.test(text) && !/[֐-ۿ]/.test(text) && !KEEP.test(text)) missing.push(node);
  }

  if (rtl) {
    // Mirror each frame's layout. The frames stay where they are, so the panorama still reads left to right.
    document.querySelectorAll('.frame').forEach((frame) => (frame.dir = 'rtl'));
    // Arrows that point "forward" should point left in RTL.
    document.querySelectorAll('svg path[d^="M2 15 H52"]').forEach((p) => p.closest('svg').classList.add('flip-rtl'));
    // The "7 items added" toast sits over the right end of the first list row, which is where RTL text starts.
    document.querySelectorAll('.frame .card[style*="left:610px"]').forEach((el) => {
      el.style.left = 'auto';
      el.style.right = '670px';
    });
  }

  if (missing.length) {
    console.warn(`[i18n] ${missing.length} untranslated:`, missing.map((n) => n.nodeValue.trim()));
    if (params.has('check')) missing.forEach((n) => n.parentElement.classList.add('untranslated'));
  }
})();
