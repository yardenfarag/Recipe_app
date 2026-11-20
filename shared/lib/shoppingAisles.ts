export type ShoppingAisle =
  | 'produce'
  | 'dairy'
  | 'meat'
  | 'seafood'
  | 'bakery'
  | 'pantry'
  | 'frozen'
  | 'spices'
  | 'other';

export const SHOPPING_AISLE_ORDER: ShoppingAisle[] = [
  'produce',
  'dairy',
  'meat',
  'seafood',
  'bakery',
  'pantry',
  'frozen',
  'spices',
  'other',
];

const ALIASES: Record<string, string> = {
  scallion: 'green onion',
  scallions: 'green onion',
  'spring onion': 'green onion',
  'green onions': 'green onion',
  cilantro: 'coriander',
  'coriander leaves': 'coriander',
  garbanzo: 'chickpea',
  garbanzos: 'chickpea',
  chickpeas: 'chickpea',
  'bell pepper': 'pepper',
  'bell peppers': 'pepper',
};

const AISLE_WORDS: Record<ShoppingAisle, string[]> = {
  produce: [
    'onion',
    'garlic',
    'tomato',
    'lemon',
    'lime',
    'herb',
    'herbs',
    'basil',
    'parsley',
    'cilantro',
    'coriander',
    'lettuce',
    'spinach',
    'kale',
    'carrot',
    'celery',
    'potato',
    'avocado',
    'cucumber',
    'pepper',
    'chili',
    'apple',
    'banana',
    'berry',
    'mushroom',
    'ginger',
    'zucchini',
    'broccoli',
    'cabbage',
    'green onion',
    'eggplant',
    'aubergine',
  ],
  dairy: [
    'milk',
    'butter',
    'cream',
    'yogurt',
    'yoghurt',
    'cheese',
    'parmesan',
    'mozzarella',
    'egg',
    'eggs',
    'sour cream',
  ],
  meat: [
    'chicken',
    'beef',
    'pork',
    'lamb',
    'turkey',
    'bacon',
    'sausage',
    'steak',
    'ground beef',
    'ground pork',
    'ground turkey',
    'ground chicken',
    'ground lamb',
    'mince',
    'minced',
  ],
  seafood: ['fish', 'salmon', 'tuna', 'shrimp', 'prawn', 'cod', 'anchovy'],
  bakery: ['bread', 'bun', 'tortilla', 'pita', 'baguette', 'roll'],
  frozen: ['frozen', 'ice cream', 'peas'],
  spices: [
    'salt',
    'cumin',
    'paprika',
    'cinnamon',
    'oregano',
    'thyme',
    'chili flake',
    'spice',
    'seasoning',
    'peppercorn',
    'peppercorns',
  ],
  pantry: [
    'oil',
    'flour',
    'sugar',
    'rice',
    'pasta',
    'noodle',
    'bean',
    'lentil',
    'chickpea',
    'stock',
    'broth',
    'soy',
    'vinegar',
    'honey',
    'maple',
    'tomato paste',
    'sauce',
  ],
  other: [],
};

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function aisleTokenMatches(normalized: string, word: string): boolean {
  const escaped = escapeRegExp(word);
  return new RegExp(`(^|[^a-z0-9])${escaped}([^a-z0-9]|$)`).test(normalized);
}

export function normalizeShoppingAlias(name: string): string {
  const key = name.trim().toLowerCase().replace(/\s+/g, ' ');
  return ALIASES[key] ?? key;
}

export function shoppingAisleForName(name: string): ShoppingAisle {
  const normalized = normalizeShoppingAlias(name);

  if (/\b(eggplant|aubergine)\b/.test(normalized)) return 'produce';
  if (
    /\b(black|white|sichuan|cayenne|ground)\s+peppers?\b/.test(normalized) ||
    /\bpeppercorns?\b/.test(normalized)
  ) {
    return 'spices';
  }

  for (const aisle of SHOPPING_AISLE_ORDER) {
    if (aisle === 'other') continue;
    if (AISLE_WORDS[aisle].some((word) => aisleTokenMatches(normalized, word))) {
      return aisle;
    }
  }
  return 'other';
}
