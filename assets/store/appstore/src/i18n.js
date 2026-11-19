// Localized store screenshots. screenshots.html stays written in English; with #lang=he or #lang=ar this
// script swaps each English string for its translation, flips every frame right-to-left and loads fonts
// that cover the script. Keys are the English text exactly as it appears in the page (an element's
// innerHTML, or a single text node). Add #check=1 to outline any English text that is still showing.
(() => {
  const STRINGS = {
    he: {
      // frame 1: hook
      'Pinch · Recipe keeper': 'Pinch · מתכונים מסרטונים',
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
      'Smart extraction': 'חילוץ חכם',
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
      'was 4': 'היה 4',
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
      '1 head': 'ראש 1',
      lemons: 'לימונים',
      tahini: 'טחינה',
      '1 jar': 'צנצנת 1',
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
      '15-min lemon garlic pasta — you NEED this': 'باستا الليمون والثوم في 15 دقيقة — جرّبوها',
      'Saved to Pinch': 'حُفظت في Pinch',
      'Lemon garlic pasta': 'باستا بالليمون والثوم',
      '25 min': '25 د',
      Easy: 'سهل',
      'Serves 4': '4 حصص',
      spaghetti: 'سباغيتي',
      '400 g': '400 غ',
      'garlic cloves': 'فصوص ثوم',
      lemon: 'ليمون',
      parmesan: 'بارميزان',
      '40 g': '40 غ',
      'Any recipe site': 'أي موقع وصفات',
      // frame 2: reads the whole video
      'Smart extraction': 'استخراج ذكي',
      'Reads the<br>whole video.': 'يقرأ الفيديو<br>كاملًا.',
      'Not just the caption. Every pinch, splash and sneaky “just a bit more”.':
        'لا يكتفي بالوصف. يلتقط كل رشّة وكل إضافة وكل «قليل بعد».',
      'Snap a recipe': 'خذ وصفة من رابط',
      'Weeknight shakshuka': 'شكشوكة سريعة',
      'Watching the video… 72%': 'يشاهد الفيديو… 72%',
      'Found so far': 'ما وجدناه حتى الآن',
      'crushed tomatoes': 'طماطم مهروسة',
      '800 g': '800 غ',
      eggs: 'بيض',
      'smoked paprika': 'بابريكا مدخّنة',
      '1 tsp': '1 ملعقة صغيرة',
      'Heard at 2:41': 'سُمع عند 2:41',
      '“…and a good<br>pinch of cumin”': '«…ورشّة جيدة<br>من الكمّون»',
      '+ 1 tsp cumin': '+ 1 ملعقة صغيرة كمّون',
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
      'Use ¾ the amount · 3 tbsp': '¾ الكمية · 3 ملاعق كبيرة',
      'Remix: make it vegan': 'ريميكس: نسخة نباتية',
      'Gluten-free': 'بدون غلوتين',
      Vegetarian: 'نباتي',
      Healthier: 'أصحّ',
      Translate: 'ترجمة',
      'EN · ES · HE · AR · RU': 'AR · HE · EN · ES · RU',
      // frame 4: shopping list
      'Shopping list': 'قائمة التسوّق',
      'The list<br><em>writes itself.</em>': 'القائمة<br><em>تكتب نفسها.</em>',
      'Add a recipe, get the groceries. Check things off in the aisle.':
        'أضف وصفة واحصل على قائمة المشتريات. علّم عليها وأنت تتسوّق.',
      List: 'القائمة',
      '5 LEFT · 2 CHECKED': 'متبقٍّ 5 · محدد 2',
      'dark chocolate': 'شوكولاتة داكنة',
      '200 g': '200 غ',
      garlic: 'ثوم',
      '1 head': 'رأس واحد',
      lemons: 'ليمون',
      tahini: 'طحينة',
      '1 jar': 'علبة واحدة',
      cucumbers: 'خيار',
      '7 items added': 'أُضيفت 7 عناصر',
      'from 2 recipes': 'من وصفتين',
      // frame 5: cook along
      'Cook along': 'اطبخ خطوة بخطوة',
      'No more<br><em>pause, rewind,</em><br>pause.': 'وداعًا<br><em>للإيقاف والإرجاع</em><br>والإيقاف.',
      'Clear steps you can follow. Tap a step to jump to that moment in the video.':
        'خطوات واضحة وسهلة. اضغط على أي خطوة لتنتقل إلى لحظتها في الفيديو.',
      'Boil the spaghetti in well salted water until al dente.': 'اسلق السباغيتي في ماء مملّح جيدًا حتى تنضج مع بقاء قوامها.',
      'Gently fry the garlic in olive oil until fragrant, not brown.':
        'قلّب الثوم بلطف في زيت الزيتون حتى تفوح رائحته، دون أن يحمرّ.',
      'Toss with lemon zest, juice, parmesan and a splash of pasta water.':
        'اخلطها مع بشر الليمون وعصيره والبارميزان وقليل من ماء السلق.',
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
  };

  // Google Fonts with the right script: a serif for headlines and a sans for everything else.
  const FONTS = {
    he: { sans: 'Heebo', serif: 'Frank Ruhl Libre', css: 'family=Heebo:wght@400;500;600;700&family=Frank+Ruhl+Libre:wght@500;700' },
    ar: { sans: 'IBM Plex Sans Arabic', serif: 'Noto Naskh Arabic', css: 'family=IBM+Plex+Sans+Arabic:wght@400;500;600;700&family=Noto+Naskh+Arabic:wght@500;700' },
  };

  // Text that stays as-is in every language: brand names, handles, URLs, times.
  const KEEP = /^(Pinch|TikTok|Instagram|YouTube|Snap|@lena\.cooks|youtube\.com · 6:12|9:41|[A-Z]{2}( · [A-Z]{2})+|[\d\s:·%+−]*)$/;

  const params = new URLSearchParams(location.hash.slice(1));
  const lang = params.get('lang') || 'en';
  if (!STRINGS[lang]) return;
  const dict = STRINGS[lang];
  const font = FONTS[lang];

  const link = document.createElement('link');
  link.rel = 'stylesheet';
  link.href = `https://fonts.googleapis.com/css2?${font.css}&display=block`;
  document.head.appendChild(link);

  const style = document.createElement('style');
  style.textContent = `
    :root { --sans: "${font.sans}", sans-serif; --serif: "${font.serif}", "${font.sans}", serif; }
    /* Hebrew and Arabic have no italics, and letter-spacing breaks Arabic joining */
    .headline em, [style*="italic"] { font-style: normal !important; }
    .headline, .eyebrow, .pill, [style*="letter-spacing"] { letter-spacing: 0 !important; }
    .headline { line-height: 1.12; }
    .flip-rtl { transform: scaleX(-1); }
    .untranslated { outline: 6px solid red !important; }
  `;
  document.head.appendChild(style);
  document.documentElement.lang = lang;

  // Whole elements first, so headlines keep their <br> and <em>; then any loose text nodes.
  for (const el of document.querySelectorAll('#stage *')) {
    const key = el.innerHTML.trim();
    if (dict[key] !== undefined) el.innerHTML = dict[key];
  }
  const walker = document.createTreeWalker(document.getElementById('stage'), NodeFilter.SHOW_TEXT);
  const missing = [];
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const text = node.nodeValue.trim();
    if (!text) continue;
    if (dict[text] !== undefined) node.nodeValue = node.nodeValue.replace(text, dict[text]);
    // Already translated (has Hebrew or Arabic letters), or nothing to translate
    else if (/[A-Za-z]/.test(text) && !/[֐-ۿ]/.test(text) && !KEEP.test(text)) missing.push(node);
  }

  // Mirror each frame's layout. The frames stay where they are, so the panorama still reads left to right.
  document.querySelectorAll('.frame').forEach((frame) => (frame.dir = 'rtl'));
  // Arrows that point "forward" should point left in RTL.
  document.querySelectorAll('svg path[d^="M2 15 H52"]').forEach((p) => p.closest('svg').classList.add('flip-rtl'));
  // The "7 items added" toast sits over the right end of the first list row, which is where RTL text starts.
  document.querySelectorAll('.frame .card[style*="left:610px"]').forEach((el) => {
    el.style.left = 'auto';
    el.style.right = '610px';
  });

  if (missing.length) {
    console.warn(`[i18n] ${missing.length} untranslated:`, missing.map((n) => n.nodeValue.trim()));
    if (params.has('check')) missing.forEach((n) => n.parentElement.classList.add('untranslated'));
  }
})();
