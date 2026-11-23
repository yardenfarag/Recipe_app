import { describe, expect, it } from 'vitest';

import { findRecipeCandidates, previewLine } from './candidates';
import { parseChatText } from './parseChat';
import type { ParsedChat } from './types';

function chat(lines: string[], photoNames: string[] = []): ParsedChat {
  return { messages: parseChatText(lines.join('\n')), photoNames };
}

const CAKE = [
  'Grandma’s cheesecake',
  'Ingredients:',
  '- 500 g cream cheese',
  '- 1 cup sugar',
  '- 3 eggs',
  '- 200 g biscuits',
  'Mix everything, pour over the base and bake at 160 for 50 minutes.',
];

describe('findRecipeCandidates: links', () => {
  const links = chat([
    '1/5/24, 10:00 - Dana: Try this one! https://www.tiktok.com/@chef/video/7350000000000000001?is_from_webapp=1&sender_device=pc',
    '1/5/24, 10:01 - Avi: https://www.instagram.com/reel/C5abcDEF123/?igsh=MWQ1ZGUxMzBkMA==',
    '1/5/24, 10:02 - Avi: https://youtu.be/dQw4w9WgXcQ?si=abc',
    '1/5/24, 10:03 - Dana: same video https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share',
    '1/5/24, 10:04 - Dana: (the recipe: https://www.allrecipes.com/recipe/12345/banana-bread/).',
    '1/5/24, 10:05 - Avi: Did you see this? https://www.ynet.co.il/news/article/abc123',
    '1/5/24, 10:06 - Avi: Call: https://us02web.zoom.us/j/123456 and https://chat.whatsapp.com/AbCdEf',
    '1/5/24, 10:07 - Avi: Here https://maps.app.goo.gl/xyz and https://www.google.com/search?q=cake https://wa.me/97250',
    '1/5/24, 10:08 - Avi: https://pin.it/4AbCdE https://www.pinterest.com/chef/',
    '1/5/24, 10:09 - Avi: https://m.facebook.com/reel/1234567890123/?mibextid=abc',
    '1/5/24, 10:10 - Avi: https://www.instagram.com/some.chef/',
  ]);

  it('finds recipe links, skips the rest, and sorts newest first', () => {
    const found = findRecipeCandidates(links);
    expect(found.map((c) => [c.platform, c.url])).toEqual([
      ['instagram', 'https://www.instagram.com/some.chef/'],
      ['facebook', 'https://m.facebook.com/reel/1234567890123/?mibextid=abc'],
      // Links in one message keep the order they were written in.
      ['pinterest', 'https://pin.it/4AbCdE'],
      ['pinterest', 'https://www.pinterest.com/chef/'],
      ['web', 'https://www.ynet.co.il/news/article/abc123'],
      ['web', 'https://www.allrecipes.com/recipe/12345/banana-bread/'],
      ['youtube', 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&feature=share'],
      ['instagram', 'https://www.instagram.com/reel/C5abcDEF123/?igsh=MWQ1ZGUxMzBkMA=='],
      [
        'tiktok',
        'https://www.tiktok.com/@chef/video/7350000000000000001?is_from_webapp=1&sender_device=pc',
      ],
    ]);
    expect(found.every((c) => c.kind === 'link')).toBe(true);
  });

  it('ticks posts and recipe pages, not profiles or news', () => {
    const likely = Object.fromEntries(findRecipeCandidates(links).map((c) => [c.url, c.likelyRecipe]));
    expect(likely['https://www.tiktok.com/@chef/video/7350000000000000001?is_from_webapp=1&sender_device=pc']).toBe(
      true,
    );
    expect(likely['https://www.allrecipes.com/recipe/12345/banana-bread/']).toBe(true);
    expect(likely['https://pin.it/4AbCdE']).toBe(true);
    expect(likely['https://m.facebook.com/reel/1234567890123/?mibextid=abc']).toBe(true);
    expect(likely['https://www.ynet.co.il/news/article/abc123']).toBe(false);
    expect(likely['https://www.pinterest.com/chef/']).toBe(false);
    expect(likely['https://www.instagram.com/some.chef/']).toBe(false);
  });

  it('keeps the words around a link as its text, and the host as its preview', () => {
    const tiktok = findRecipeCandidates(links).find((c) => c.platform === 'tiktok')!;
    expect(tiktok.text).toBe('Try this one!');
    expect(tiktok.preview).toBe('tiktok.com');
    const web = findRecipeCandidates(links).find((c) => c.url?.includes('allrecipes'))!;
    expect(web.preview).toBe('allrecipes.com/recipe/12345/banana-bread');
    expect(web.text).toBe('(the recipe:).');
  });

  it('marks links already in the Library, matching their saved form', () => {
    const found = findRecipeCandidates(links, {
      savedSourceUrls: [
        'https://www.instagram.com/p/C5abcDEF123/',
        'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
        'https://allrecipes.com/recipe/12345/banana-bread?utm_source=x',
      ],
    });
    const saved = found.filter((c) => c.alreadySaved).map((c) => c.platform);
    expect(saved.sort()).toEqual(['instagram', 'web', 'youtube']);
  });

  it('marks candidates imported before, by id', () => {
    const first = findRecipeCandidates(links);
    const again = findRecipeCandidates(links, { importedIds: [first[0].id] });
    expect(again[0].id).toBe(first[0].id);
    expect(again[0].alreadySaved).toBe(true);
    expect(again.slice(1).some((c) => c.alreadySaved)).toBe(false);
  });

  it('trims sentence punctuation and stray brackets, keeps balanced ones', () => {
    const found = findRecipeCandidates(
      chat([
        '1/5/24, 10:00 - Dana: Look at https://en.wikipedia.org/wiki/Cake_(food) yum',
        '1/5/24, 10:01 - Dana: *https://www.bbcgoodfood.com/recipes/lasagne*',
        '1/5/24, 10:02 - Dana: מתכון מעולה: https://www.10dakot.co.il/recipe/עוגה!!',
      ]),
    );
    expect(found.map((c) => c.url)).toEqual([
      'https://www.10dakot.co.il/recipe/עוגה',
      'https://www.bbcgoodfood.com/recipes/lasagne',
      'https://en.wikipedia.org/wiki/Cake_(food)',
    ]);
  });
});

describe('findRecipeCandidates: written recipes', () => {
  it('finds a written recipe and leaves chit-chat out', () => {
    const found = findRecipeCandidates(
      chat([
        '1/5/24, 10:00 - Dana: Who is coming on Friday?',
        `1/5/24, 10:01 - Avi: ${CAKE.join('\n')}`,
        '1/5/24, 10:02 - Dana: Thanks!! Will make it for the weekend, the kids will love it. Do you think it works with less sugar?',
      ]),
    );
    expect(found).toHaveLength(1);
    expect(found[0]).toMatchObject({
      kind: 'text',
      sender: 'Avi',
      sentAt: '2024-05-01T10:01:00',
      preview: 'Grandma’s cheesecake',
      likelyRecipe: true,
      alreadySaved: false,
    });
    expect(found[0].text).toBe(CAKE.join('\n'));
  });

  it('gives the same id to the same recipe sent twice, and lists it once (newest)', () => {
    const found = findRecipeCandidates(
      chat([`1/5/24, 10:01 - Avi: ${CAKE.join('\n')}`, `2/5/24, 10:01 - Dana: ${CAKE.join('\n')}`]),
    );
    expect(found).toHaveLength(1);
    expect(found[0].sender).toBe('Dana');
  });

  it('does not double a recipe that comes with its link', () => {
    const found = findRecipeCandidates(
      chat([`1/5/24, 10:01 - Avi: ${CAKE.join('\n')}`, 'https://www.instagram.com/p/C5abcDEF123/']),
    );
    expect(found.map((c) => c.kind)).toEqual(['link']);
    expect(found[0].text).toBe(CAKE.join('\n'));
  });
});

describe('findRecipeCandidates: precision on a busy family chat', () => {
  const RECIPES = [
    `Avi: ${CAKE.join('\n')}`,
    'סבתא: קציצות ברוטב\nמצרכים:\n500 גרם בשר טחון\n1 בצל קצוץ\n2 ביצים\n3 כפות פירורי לחם\nמלח ופלפל\nמערבבים הכול, יוצרים קציצות ומבשלים ברוטב עגבניות 40 דקות.',
    'Abuela: Flan casero\nIngredientes:\n4 huevos\n1 taza de azúcar\n500 ml de leche\nPreparación: batir los huevos con la leche, añadir el azúcar y hornear al baño maría 50 minutos.',
    'Бабушка: Блины\n500 мл молока\n2 яйца\n1 стакан муки\n1 ст. л. сахара\nщепотка соли\nСмешать всё, дать постоять 10 минут и жарить на горячей сковороде.',
    'جدتي: المجدرة\nالمقادير:\n1 كوب عدس\n1 كوب أرز\n2 بصلة\nملح وكمون\nنسلق العدس، نضيف الأرز والملح ونطبخ 20 دقيقة، ونقلي البصل ونضعه فوقها.',
  ];
  const CHATTER = [
    'Dana: Good morning everyone ☀️',
    'Dana: Who is coming on Friday? I need to know how many plates to put out.',
    'Avi: Running late, be there in 10 minutes. Please start without me, and save me some of the salad!',
    'Dana: Shopping list for tomorrow:\nmilk\neggs\nbread\n2 onions\ntomatoes\ncheese\ntoilet paper',
    'Avi: Plan for Saturday:\n10:00 meet at the park\n11:30 picnic\n14:00 swim\n16:00 head home\nAdd your names below.',
    'סבתא: שבת שלום לכולם! מחכה לראות אתכם בשישי, תביאו את הילדים ואל תשכחו מעילים כי קר בערב. אין צורך להביא שום דבר, יש מספיק אוכל לכולם.',
    'Abuela: ¡Feliz cumpleaños, cariño! Te queremos mucho. Nos vemos el domingo a las 2 para comer todos juntos en casa.',
    'Бабушка: Дети, позвоните мне вечером, я хочу обсудить поездку на дачу в субботу. Возьмите с собой тёплые вещи и воду.',
    'جدتي: صباح الخير يا أحبائي، لا تنسوا زيارتنا يوم الجمعة بعد الصلاة، وسنتناول الغداء معاً في البيت إن شاء الله.',
    'Dana: Thanks for dinner last night, it was amazing! The kids are still talking about the dessert 😍',
  ];

  it('finds the recipe in every language and nothing else', () => {
    const lines = [...CHATTER.slice(0, 5), ...RECIPES, ...CHATTER.slice(5)].map(
      (message, i) => `1/5/24, 10:${String(i).padStart(2, '0')} - ${message}`,
    );
    const found = findRecipeCandidates(chat(lines));
    expect(found.map((c) => [c.kind, c.sender, c.likelyRecipe])).toEqual([
      ['text', 'جدتي', true],
      ['text', 'Бабушка', true],
      ['text', 'Abuela', true],
      ['text', 'סבתא', true],
      ['text', 'Avi', true],
    ]);
  });
});

describe('findRecipeCandidates: photos', () => {
  const photoNames = [
    'IMG-20240501-WA0001.jpg',
    'IMG-20240501-WA0002.jpg',
    'IMG-20240501-WA0003.jpg',
    '00000004-PHOTO-2024-05-01-10-05-00.jpg',
    '00000005-PHOTO-2024-05-01-10-06-00.heic',
    'VID-20240501-WA0006.mp4',
  ];

  it('turns attached images into candidates with captions from the same or the next message', () => {
    const found = findRecipeCandidates(
      chat(
        [
          '1/5/24, 10:00 - Dana: IMG-20240501-WA0001.jpg (file attached)',
          'Grandma’s apple cake',
          '1/5/24, 10:01 - Avi: IMG-20240501-WA0002.jpg (file attached)',
          '1/5/24, 10:02 - Avi: IMG-20240501-WA0003.jpg (file attached)',
          '1/5/24, 10:02 - Avi: the recipe for this shakshuka is in the book',
          '1/5/24, 10:05 - Dana: \u200E<attached: 00000004-PHOTO-2024-05-01-10-05-00.jpg>',
          '1/5/24, 10:30 - Dana: kids at the beach',
          '1/5/24, 10:31 - Dana: VID-20240501-WA0006.mp4 (file attached)',
          '1/5/24, 10:32 - Dana: IMG-20240501-WA0099.jpg (file attached)',
        ],
        photoNames,
      ),
    );
    expect(found.map((c) => [c.photo?.fileName, c.text, c.likelyRecipe])).toEqual([
      ['00000004-PHOTO-2024-05-01-10-05-00.jpg', undefined, false],
      ['IMG-20240501-WA0003.jpg', 'the recipe for this shakshuka is in the book', true],
      ['IMG-20240501-WA0002.jpg', 'the recipe for this shakshuka is in the book', true],
      ['IMG-20240501-WA0001.jpg', 'Grandma’s apple cake', true],
    ]);
    expect(found.every((c) => c.kind === 'photo' && c.photo?.mime === 'image/jpeg')).toBe(true);
    expect(found[3].preview).toBe('Grandma’s apple cake');
    expect(found[0].preview).toBe('');
  });

  it('ticks a photo sent right next to a link or a written recipe by the same person', () => {
    const found = findRecipeCandidates(
      chat(
        [
          '1/5/24, 10:00 - Dana: https://www.tiktok.com/@chef/video/7350000000000000001',
          '1/5/24, 10:01 - Dana: IMG-20240501-WA0001.jpg (file attached)',
          '1/5/24, 10:02 - Avi: IMG-20240501-WA0002.jpg (file attached)',
          `1/5/24, 11:00 - Avi: ${CAKE.join('\n')}`,
          '1/5/24, 11:01 - Avi: \u200E<attached: 00000005-PHOTO-2024-05-01-10-06-00.heic>',
        ],
        photoNames,
      ),
    );
    const photos = Object.fromEntries(
      found.filter((c) => c.kind === 'photo').map((c) => [c.photo!.fileName, [c.likelyRecipe, c.photo!.mime]]),
    );
    expect(photos).toEqual({
      'IMG-20240501-WA0001.jpg': [true, 'image/jpeg'],
      'IMG-20240501-WA0002.jpg': [false, 'image/jpeg'],
      '00000005-PHOTO-2024-05-01-10-06-00.heic': [true, 'image/heic'],
    });
  });

  it('skips photos that are not in the export (a .txt without media)', () => {
    const found = findRecipeCandidates(
      chat(['1/5/24, 10:00 - Dana: IMG-20240501-WA0001.jpg (file attached)', 'Grandma’s apple cake']),
    );
    expect(found).toEqual([]);
  });

  it('matches attachments to zip entries inside folders', () => {
    const found = findRecipeCandidates(
      chat(['1/5/24, 10:00 - Dana: IMG-20240501-WA0001.jpg (file attached)'], ['Chat/IMG-20240501-WA0001.jpg']),
    );
    expect(found[0].photo).toEqual({ fileName: 'Chat/IMG-20240501-WA0001.jpg', mime: 'image/jpeg' });
  });
});

describe('findRecipeCandidates: ids', () => {
  it('are stable across reads and differ between kinds', () => {
    const lines = [
      '1/5/24, 10:00 - Dana: https://www.tiktok.com/@chef/video/7350000000000000001',
      `1/5/24, 10:01 - Avi: ${CAKE.join('\n')}`,
      '1/5/24, 10:02 - Dana: IMG-20240501-WA0001.jpg (file attached)',
    ];
    const first = findRecipeCandidates(chat(lines, ['IMG-20240501-WA0001.jpg']));
    const second = findRecipeCandidates(chat(lines, ['IMG-20240501-WA0001.jpg']));
    expect(first.map((c) => c.id)).toEqual(second.map((c) => c.id));
    expect(new Set(first.map((c) => c.id)).size).toBe(3);
    expect(first.map((c) => c.id.split('-')[0])).toEqual(['photo', 'text', 'link']);
  });
});

describe('previewLine', () => {
  it('keeps the first non-empty line and cuts it at 80 characters', () => {
    expect(previewLine('\n  Hello   world \nsecond')).toBe('Hello world');
    const long = previewLine('🍰'.repeat(100));
    expect(Array.from(long)).toHaveLength(80);
    expect(long.endsWith('…')).toBe(true);
  });
});
