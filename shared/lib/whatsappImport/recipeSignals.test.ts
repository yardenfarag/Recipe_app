import { describe, expect, it } from 'vitest';

import { looksFoodRelated, normalizeForMatch, recipeShape, urlLooksLikeRecipe } from './recipeSignals';

const RECIPES = {
  en: [
    'Banana bread',
    'Ingredients:',
    '- 3 ripe bananas',
    '- 2 cups flour',
    '- 1 cup sugar',
    '- 2 eggs',
    '- 100 g butter, melted',
    'Method: preheat the oven to 180. Mix everything, pour into a tin and bake for 50 minutes.',
  ].join('\n'),
  he: [
    'עוגת שוקולד של סבתא 🍫',
    'מצרכים:',
    '2 כוסות קמח',
    '1.5 כוסות סוכר',
    '3 ביצים',
    '200 גרם חמאה',
    'אופן ההכנה:',
    'מחממים תנור ל-180 מעלות, מערבבים הכול ואופים 40 דקות.',
  ].join('\n'),
  es: [
    'Tortilla de patatas',
    'Ingredientes:',
    '• 6 huevos',
    '• 4 patatas',
    '• 1 cebolla',
    '• aceite de oliva y sal',
    'Preparación: freír las patatas con la cebolla, batir los huevos, mezclar y cocinar 5 minutos por cada lado.',
  ].join('\n'),
  ru: [
    'Сырники',
    'Ингредиенты:',
    '500 г творога',
    '2 яйца',
    '3 ст. л. муки',
    '2 ст. л. сахара',
    'Приготовление: смешать всё, сформировать сырники и обжарить на масле по 3 минуты с каждой стороны.',
  ].join('\n'),
  ar: [
    'كيكة البرتقال',
    'المكونات:',
    '٣ بيضات',
    '١ كوب سكر',
    '٢ كوب طحين',
    '١/٢ كوب زيت',
    'طريقة التحضير: نخفق البيض مع السكر، نضيف الزيت والطحين، ونخبز في الفرن ٤٠ دقيقة.',
  ].join('\n'),
};

describe('recipeShape', () => {
  it.each(Object.entries(RECIPES))('finds a written recipe in %s', (_lang, text) => {
    expect(recipeShape(text)).toBe('strong');
  });

  it('finds a prose recipe without a list', () => {
    const text =
      'My mum’s pancakes: whisk 2 eggs with 300 ml milk and 200 g flour, add a pinch of salt and 1 tbsp sugar, ' +
      'rest for 10 minutes, then fry thin pancakes in a hot pan with a little butter.';
    expect(recipeShape(text)).toBe('strong');
  });

  it.each([
    ['short chit-chat', 'Who’s coming on Friday? I can bring the salad and some bread.'],
    [
      'a long message with no recipe',
      'Hi everyone! Just a reminder that the family dinner is on Friday at 8. Please let me know by Wednesday ' +
        'if you are coming, and whether you are bringing kids. We will also celebrate Avi’s birthday, so bring ' +
        'a good mood. See you all there!',
    ],
    [
      'a schedule',
      'Plan for Saturday:\n10:00 meet at the park\n11:30 picnic\n14:00 swim\n16:00 head home\nAdd your names below.',
    ],
    ['a shopping list', 'Shopping list:\nmilk\neggs\nbread\n2 onions\ntomatoes\ncheese\napples\nwashing powder'],
    [
      'Hebrew chit-chat',
      'היי לכולם, מזכירה שארוחת שישי אצלנו השבוע. תגידו עד רביעי מי מגיע ואם אתם מביאים את הילדים. אין צורך להביא שום דבר, רק מצב רוח טוב!',
    ],
  ])('ignores %s', (_name, text) => {
    expect(recipeShape(text)).toBeNull();
  });

  it('calls a partial recipe weak', () => {
    const text =
      'For the sauce you need 2 tomatoes, garlic, olive oil and salt. Cook it slowly and add basil at the end. ' +
      'Works with any pasta.';
    expect(recipeShape(text)).toBe('weak');
  });
});

describe('looksFoodRelated', () => {
  it.each(['Grandma’s apple cake', 'מתכון לחלה', 'עוגת גבינה', 'receta de la abuela', 'Рецепт борща', 'وصفة المقلوبة'])(
    'is true for %s',
    (caption) => {
      expect(looksFoodRelated(caption)).toBe(true);
    },
  );

  it.each(['Look at the kids!', 'חג שמח', '', 'At the beach', 'Нас поздравили'])('is false for "%s"', (caption) => {
    expect(looksFoodRelated(caption)).toBe(false);
  });
});

describe('urlLooksLikeRecipe', () => {
  it('reads recipe words in the host or the path, in any script', () => {
    expect(urlLooksLikeRecipe('www.allrecipes.com', '/recipe/123/x')).toBe(true);
    expect(urlLooksLikeRecipe('smittenkitchen.com', '/2024/05/x')).toBe(true);
    expect(urlLooksLikeRecipe('example.com', '/2024/05/chocolate-babka/')).toBe(true);
    expect(urlLooksLikeRecipe('example.co.il', `/${encodeURIComponent('עוגת-גבינה')}`)).toBe(true);
    expect(urlLooksLikeRecipe('www.ynet.co.il', '/news/article/abc123')).toBe(false);
  });
});

describe('normalizeForMatch', () => {
  it('drops accents, Hebrew points and Arabic diacritics, and unifies alef and digits', () => {
    expect(normalizeForMatch('Azúcar')).toBe('azucar');
    expect(normalizeForMatch('א\u05B3כ\u05B6ל')).toBe('אכל');
    expect(normalizeForMatch('أ\u064Eر\u064Fز\u0651 ٢')).toBe('ارز 2');
  });
});
