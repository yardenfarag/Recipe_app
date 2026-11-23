/**
 * Canned data for scripts/mobile-screenshots.mjs: one signed-in cook with a library, collections, a shopping list,
 * credits and Hub recipes. Nothing here reaches a real server; the screenshot tool answers the app's Supabase calls
 * with these rows.
 */

export const FAKE_SUPABASE_URL = 'http://pinch-fake.local';
export const FAKE_SUPABASE_KEY = 'fake-anon-key-for-screenshots';
/** supabase-js keys the session by the first label of the project host. */
export const AUTH_STORAGE_KEY = `sb-${new URL(FAKE_SUPABASE_URL).hostname.split('.')[0]}-auth-token`;

export const USER_ID = '7d1c2f4e-5b6a-4c3d-9e8f-0a1b2c3d4e5f';
export const USER_EMAIL = 'noa.cohen@example.com';
export const USER_NAME = 'Noa Cohen';

const DAY = 24 * 60 * 60 * 1000;
const ago = (days, hours = 0) => new Date(Date.now() - days * DAY - hours * 3600 * 1000).toISOString();

/** Placeholder photo colours (and a food emoji) per image key; served as SVG by the tool. */
export const PHOTOS = {
  shakshuka: { from: '#C2410C', to: '#7C2D12', emoji: '🍳' },
  pasta: { from: '#EAB308', to: '#A16207', emoji: '🍝' },
  salmon: { from: '#F97316', to: '#9A3412', emoji: '🐟' },
  cookies: { from: '#92400E', to: '#451A03', emoji: '🍪' },
  salad: { from: '#65A30D', to: '#365314', emoji: '🥗' },
  ramen: { from: '#B45309', to: '#3F2A12', emoji: '🍜' },
  tacos: { from: '#DC2626', to: '#7F1D1D', emoji: '🌮' },
  oats: { from: '#D6B98C', to: '#8A6A3B', emoji: '🥣' },
  curry: { from: '#CA8A04', to: '#713F12', emoji: '🍛' },
  pizza: { from: '#EF4444', to: '#991B1B', emoji: '🍕' },
  dumplings: { from: '#E7D3B0', to: '#9C7A4A', emoji: '🥟' },
  bowl: { from: '#16A34A', to: '#14532D', emoji: '🥙' },
  cake: { from: '#DB2777', to: '#831843', emoji: '🍰' },
  soup: { from: '#EA580C', to: '#7C2D12', emoji: '🍲' },
};

export const photoUrl = (key) => `${FAKE_SUPABASE_URL}/storage/v1/object/public/recipe-images/${key}.svg`;

const ing = (name, quantity, unit = '') => ({ name, quantity, unit });
const steps = (...texts) => texts.map((text, i) => ({ step: i + 1, text }));

function recipe(fields) {
  return {
    user_id: USER_ID,
    appliances: null,
    calories_reasoning: null,
    cook_note: null,
    cost_estimate: '$',
    effort_level: 'Easy',
    extraction_source: 'captions',
    extraction_status: 'full',
    image_generated: false,
    is_favorite: false,
    kitchen_adapted_summary: null,
    kitchen_original: null,
    last_cooked_at: null,
    locked_fields: [],
    migrated_from_guest: false,
    missing_fields: null,
    nutrition: null,
    recalc_pending: [],
    recalc_started_at: null,
    servings: 2,
    source_language: 'en',
    source_video_url: null,
    tags: [],
    time_reasoning: null,
    ...fields,
    image_url: photoUrl(fields.photo),
    photo: undefined,
  };
}

/** The recipe the `recipe` and `cook` screens open. */
export const MAIN_RECIPE_ID = 'a1f0c3d2-0001-4b7e-8c11-5e6f7a8b9c01';

export const RECIPES = [
  recipe({
    id: MAIN_RECIPE_ID,
    title: 'Smoky shakshuka with feta',
    photo: 'shakshuka',
    original_url: 'https://www.tiktok.com/@cookwithlior/video/7301234567890123456',
    platform: 'tiktok',
    servings: 4,
    calories: 410,
    nutrition: { protein_g: 22, carbs_g: 24, fat_g: 26 },
    estimated_time_minutes: 30,
    cost_estimate: '$',
    effort_level: 'Easy',
    tags: ['breakfast', 'vegetarian', 'one-pan'],
    is_favorite: true,
    last_cooked_at: ago(2),
    cook_note: 'Extra chili flakes, and pull it off the heat while the yolks still wobble.',
    created_at: ago(1, 3),
    ingredients: [
      ing('olive oil', 2, 'tbsp'),
      ing('onion, sliced', 1),
      ing('red bell pepper, sliced', 1),
      ing('garlic cloves, minced', 3),
      ing('smoked paprika', 1, 'tsp'),
      ing('ground cumin', 1, 'tsp'),
      ing('crushed tomatoes', 800, 'g'),
      ing('eggs', 6),
      ing('feta, crumbled', 100, 'g'),
      ing('fresh parsley', 1, 'handful'),
    ],
    instructions: steps(
      'Warm the olive oil in a wide pan over medium heat. Cook the onion and pepper for 8 minutes until soft.',
      'Stir in the garlic, paprika and cumin and cook for 1 minute until fragrant.',
      'Pour in the tomatoes, season with salt and simmer for 10 minutes until slightly thick.',
      'Make six wells and crack an egg into each. Cover and cook for 5–7 minutes until the whites set.',
      'Scatter the feta and parsley over the top and serve straight from the pan with warm bread.',
    ),
  }),
  recipe({
    id: 'a1f0c3d2-0002-4b7e-8c11-5e6f7a8b9c02',
    title: 'Creamy lemon garlic pasta',
    photo: 'pasta',
    original_url: 'https://www.instagram.com/reel/C9xYzAbCdEf/',
    platform: 'instagram',
    servings: 2,
    calories: 620,
    estimated_time_minutes: 20,
    tags: ['dinner', 'pasta', 'weeknight'],
    is_favorite: true,
    last_cooked_at: ago(4),
    created_at: ago(3),
    extraction_source: 'description',
    ingredients: [ing('spaghetti', 200, 'g'), ing('garlic cloves', 4), ing('lemon', 1), ing('butter', 30, 'g'), ing('parmesan', 40, 'g')],
    instructions: steps('Boil the pasta.', 'Melt butter with garlic.', 'Toss with lemon, parmesan and pasta water.'),
  }),
  recipe({
    id: 'a1f0c3d2-0003-4b7e-8c11-5e6f7a8b9c03',
    title: 'Crispy miso salmon bowls',
    photo: 'salmon',
    original_url: 'https://www.youtube.com/watch?v=Xk3pQ9sLmN0',
    platform: 'youtube',
    servings: 2,
    calories: 540,
    estimated_time_minutes: 25,
    cost_estimate: '$$',
    effort_level: 'Medium',
    tags: ['dinner', 'high-protein', 'asian'],
    last_cooked_at: ago(5),
    created_at: ago(6),
    extraction_source: 'video',
    ingredients: [ing('salmon fillets', 2), ing('white miso', 2, 'tbsp'), ing('rice', 150, 'g'), ing('cucumber', 1)],
    instructions: steps('Glaze the salmon with miso.', 'Roast for 12 minutes.', 'Serve over rice with cucumber.'),
  }),
  recipe({
    id: 'a1f0c3d2-0004-4b7e-8c11-5e6f7a8b9c04',
    title: 'Brown butter chocolate chip cookies',
    photo: 'cookies',
    original_url: 'https://www.tiktok.com/@bakedbymaya/video/7298765432109876543',
    platform: 'tiktok',
    servings: 12,
    calories: 210,
    estimated_time_minutes: 45,
    effort_level: 'Medium',
    tags: ['dessert', 'baking'],
    is_favorite: true,
    created_at: ago(9),
    ingredients: [ing('butter', 115, 'g'), ing('brown sugar', 150, 'g'), ing('egg', 1), ing('flour', 180, 'g'), ing('dark chocolate', 150, 'g')],
    instructions: steps('Brown the butter.', 'Mix the dough.', 'Bake at 180°C for 11 minutes.'),
  }),
  recipe({
    id: 'a1f0c3d2-0005-4b7e-8c11-5e6f7a8b9c05',
    title: 'Smashed cucumber salad',
    photo: 'salad',
    original_url: 'https://www.instagram.com/reel/C8aBcDeFgHi/',
    platform: 'instagram',
    servings: 2,
    calories: 140,
    estimated_time_minutes: 10,
    tags: ['salad', 'side', 'quick', 'vegan'],
    created_at: ago(12),
    ingredients: [ing('cucumbers', 2), ing('sesame oil', 1, 'tbsp'), ing('rice vinegar', 2, 'tbsp'), ing('chili crisp', 1, 'tsp')],
    instructions: steps('Smash and salt the cucumbers.', 'Whisk the dressing.', 'Toss and serve cold.'),
  }),
  recipe({
    id: 'a1f0c3d2-0006-4b7e-8c11-5e6f7a8b9c06',
    title: '15-minute chicken ramen',
    photo: 'ramen',
    original_url: 'https://www.youtube.com/shorts/Rm9aB2cD3eF',
    platform: 'youtube',
    servings: 2,
    calories: 580,
    estimated_time_minutes: 15,
    tags: ['dinner', 'soup', 'quick'],
    last_cooked_at: ago(6),
    created_at: ago(15),
    ingredients: [ing('ramen noodles', 2, 'packs'), ing('chicken stock', 1, 'l'), ing('soy sauce', 2, 'tbsp'), ing('soft-boiled eggs', 2)],
    instructions: steps('Simmer the stock with soy and ginger.', 'Cook the noodles.', 'Top with eggs and scallions.'),
  }),
  recipe({
    id: 'a1f0c3d2-0007-4b7e-8c11-5e6f7a8b9c07',
    title: 'Crispy chickpea tacos',
    photo: 'tacos',
    original_url: 'https://www.tiktok.com/@plantbasedben/video/7287654321098765432',
    platform: 'tiktok',
    servings: 3,
    calories: 450,
    estimated_time_minutes: 25,
    tags: ['dinner', 'vegan', 'mexican'],
    created_at: ago(21),
    ingredients: [ing('chickpeas', 400, 'g'), ing('corn tortillas', 6), ing('avocado', 1), ing('lime', 1)],
    instructions: steps('Roast the spiced chickpeas.', 'Warm the tortillas.', 'Fill and finish with lime.'),
  }),
  recipe({
    id: 'a1f0c3d2-0008-4b7e-8c11-5e6f7a8b9c08',
    title: 'Honey tahini overnight oats',
    photo: 'oats',
    original_url: 'https://www.pinchofyum.com/overnight-oats',
    platform: 'web',
    servings: 1,
    calories: 390,
    estimated_time_minutes: 5,
    tags: ['breakfast', 'make-ahead'],
    created_at: ago(30),
    extraction_source: 'web',
    ingredients: [ing('rolled oats', 50, 'g'), ing('milk', 120, 'ml'), ing('tahini', 1, 'tbsp'), ing('honey', 1, 'tbsp')],
    instructions: steps('Stir everything in a jar.', 'Chill overnight.'),
  }),
];

/** Hebrew copies, as `recipe_translations` rows. The main recipe is translated in full; others by title. */
const HE_TITLES = {
  [RECIPES[0].id]: 'שקשוקה מעושנת עם פטה',
  [RECIPES[1].id]: 'פסטה שמנת לימון ושום',
  [RECIPES[2].id]: 'קערות סלמון מיסו פריך',
  [RECIPES[3].id]: 'עוגיות שוקולד צ׳יפס בחמאה חומה',
  [RECIPES[4].id]: 'סלט מלפפונים מרוסקים',
  [RECIPES[5].id]: 'ראמן עוף ב-15 דקות',
  [RECIPES[6].id]: 'טאקו חומוס פריך',
  [RECIPES[7].id]: 'שיבולת שועל לילית עם טחינה ודבש',
};

const HE_MAIN = {
  ingredients: [
    ing('שמן זית', 2, 'כפות'),
    ing('בצל, פרוס', 1),
    ing('פלפל אדום, פרוס', 1),
    ing('שיני שום, קצוצות', 3),
    ing('פפריקה מעושנת', 1, 'כפית'),
    ing('כמון טחון', 1, 'כפית'),
    ing('עגבניות מרוסקות', 800, 'גרם'),
    ing('ביצים', 6),
    ing('פטה, מפוררת', 100, 'גרם'),
    ing('פטרוזיליה טרייה', 1, 'חופן'),
  ],
  instructions: steps(
    'מחממים את שמן הזית במחבת רחבה על אש בינונית. מבשלים את הבצל והפלפל 8 דקות עד שהם מתרככים.',
    'מוסיפים את השום, הפפריקה והכמון ומבשלים דקה עד שעולה ריח.',
    'מוסיפים את העגבניות, מתבלים במלח ומבשלים 10 דקות עד שהרוטב מסמיך מעט.',
    'עושים שש גומות ושוברים ביצה לכל אחת. מכסים ומבשלים 5–7 דקות עד שהחלבון מתייצב.',
    'מפזרים פטה ופטרוזיליה ומגישים ישר מהמחבת עם לחם חם.',
  ),
};

export function recipeTranslations(language) {
  if (language !== 'he') return [];
  return RECIPES.map((r) => ({
    recipe_id: r.id,
    language_code: 'he',
    title: HE_TITLES[r.id],
    ingredients: r.id === MAIN_RECIPE_ID ? HE_MAIN.ingredients : r.ingredients,
    instructions: r.id === MAIN_RECIPE_ID ? HE_MAIN.instructions : r.instructions,
    translation_version: 2,
    created_at: r.created_at,
  }));
}

export const COLLECTIONS = [
  { id: 'c011ec70-0001-4a00-9000-000000000001', user_id: USER_ID, name: 'Weeknight dinners', created_at: ago(40) },
  { id: 'c011ec70-0002-4a00-9000-000000000002', user_id: USER_ID, name: 'Weekend baking', created_at: ago(35) },
  { id: 'c011ec70-0003-4a00-9000-000000000003', user_id: USER_ID, name: 'Hosting friends', created_at: ago(20) },
];

export const COLLECTION_RECIPES = [
  [0, 1], [0, 2], [0, 5], [0, 6],
  [1, 3], [1, 7],
  [2, 0], [2, 4], [2, 6],
].map(([c, r]) => ({ collection_id: COLLECTIONS[c].id, recipe_id: RECIPES[r].id, created_at: ago(10) }));

function shoppingItem(n, name, quantity, unit, checked, recipeIdx) {
  return {
    id: `5b0bb1e0-00${String(n).padStart(2, '0')}-4c00-8000-000000000000`,
    user_id: USER_ID,
    name,
    quantity,
    unit,
    checked,
    source_recipe_ids: recipeIdx === null ? null : [RECIPES[recipeIdx].id],
    created_at: ago(1, 10 - n),
    updated_at: ago(1, 10 - n),
  };
}

/** The list as a cook using the app in `language` would have typed it (Hebrew for he, English otherwise). */
export function shoppingList(language) {
  const he = language === 'he';
  return [
    shoppingItem(1, he ? 'ביצים' : 'eggs', 6, null, false, 0),
    shoppingItem(2, he ? 'עגבניות מרוסקות' : 'crushed tomatoes', 800, 'g', false, 0),
    shoppingItem(3, he ? 'פטה' : 'feta', 100, 'g', false, 0),
    shoppingItem(4, he ? 'פלפל אדום' : 'red bell pepper', 1, null, true, 0),
    shoppingItem(5, he ? 'ספגטי' : 'spaghetti', 200, 'g', false, 1),
    shoppingItem(6, he ? 'לימונים' : 'lemons', 2, null, false, 1),
    shoppingItem(7, he ? 'פרמזן' : 'parmesan', 40, 'g', true, 1),
    shoppingItem(8, he ? 'פילה סלמון' : 'salmon fillets', 2, null, false, 2),
    shoppingItem(9, he ? 'חלב שיבולת שועל' : 'oat milk', 1, 'l', false, null),
  ];
}

export function profileRow({ admin }) {
  return {
    id: USER_ID,
    email: USER_EMAIL,
    avatar_url: 'food:avocado',
    token_balance: 12,
    is_admin: admin,
    token_pack_notify_at: null,
    subscription_status: 'free',
    subscription_expires_at: null,
    free_extracts_used: 10,
    contribute_to_hub: true,
    nudges_opt_out: false,
    created_at: ago(60),
    kitchen: {
      diets: ['vegetarian'],
      alwaysSwap: [],
      autoApplyOnExtract: false,
      pantryStaples: ['salt', 'olive oil', 'black pepper'],
      allergies: [],
      otherAllergies: [],
      dislikes: ['cilantro'],
    },
  };
}

/** All 10 free monthly recipes used, so the 12 credits on the account are the balance the app shows. */
export const EXTRACT_USAGE = { user_id: USER_ID, extract_count: 10 };

export const TOKEN_LEDGER = [
  { id: 'e1', user_id: USER_ID, delta: 20, balance_after: 20, reason: 'recipe_credit_purchase', ref_id: null, metadata: {}, created_at: ago(25) },
  { id: 'e2', user_id: USER_ID, delta: -8, balance_after: 12, reason: 'extract', ref_id: null, metadata: {}, created_at: ago(3) },
];

function card(n, photo, title, platform, url, minutes, tags, saves, extra = {}) {
  return {
    id: `cad0000${n}-0000-4d00-8000-00000000000${n}`,
    canonical_key: `${platform}:${n}`,
    canonical_url: url,
    original_url: url,
    platform,
    title,
    image_url: photoUrl(photo),
    image_generated: false,
    source_video_url: null,
    ingredients: [ing('olive oil', 2, 'tbsp'), ing('garlic cloves', 2), ing('salt', 1, 'pinch')],
    instructions: steps('Prep everything.', 'Cook it through.', 'Serve warm.'),
    servings: 4,
    calories: 480,
    nutrition: null,
    estimated_time_minutes: minutes,
    cost_estimate: '$$',
    effort_level: 'Easy',
    extraction_status: 'full',
    extraction_source: 'captions',
    tags,
    source_language: 'en',
    appliances: null,
    save_count: saves,
    extract_hit_count: saves * 2,
    diets: null,
    hidden_at: null,
    hidden_reason: null,
    public_slug: `card-${n}`,
    created_at: ago(n * 3),
    updated_at: ago(n),
    ...extra,
  };
}

export const HUB_CARDS = [
  card(1, 'curry', 'One-pot chickpea coconut curry', 'tiktok', 'https://www.tiktok.com/@spiceandsoul/video/7311111111111111111', 35, ['dinner', 'vegan'], 1284),
  card(2, 'pizza', 'No-knead focaccia pizza', 'youtube', 'https://www.youtube.com/watch?v=Fo4cAcc1aPz', 90, ['baking', 'pizza'], 962),
  card(3, 'dumplings', 'Pan-fried pork dumplings', 'instagram', 'https://www.instagram.com/reel/C7dUmPlInGs/', 50, ['asian', 'dinner'], 845),
  card(4, 'bowl', 'Falafel power bowl', 'tiktok', 'https://www.tiktok.com/@greenplates/video/7322222222222222222', 30, ['lunch', 'vegetarian'], 731),
  card(5, 'cake', 'Olive oil lemon cake', 'youtube', 'https://www.youtube.com/watch?v=0l1veOi1Cak', 60, ['dessert', 'baking'], 655),
  card(6, 'soup', 'Roasted tomato soup', 'web', 'https://www.example-kitchen.com/roasted-tomato-soup', 40, ['soup', 'vegetarian'], 540),
  card(7, 'salad', 'Crunchy Thai peanut salad', 'instagram', 'https://www.instagram.com/reel/C6tHaIsAlAd/', 15, ['salad', 'quick'], 498),
  card(8, 'ramen', 'Spicy garlic noodles', 'tiktok', 'https://www.tiktok.com/@noodlenights/video/7333333333333333333', 15, ['quick', 'asian'], 433),
];

export const HUB_TAGS = ['dinner', 'quick', 'vegetarian', 'baking', 'asian', 'dessert', 'vegan', 'soup'];

/** A Supabase user, with the preferences the account holds (they win over the device's copy). */
export function fakeUser({ lang, scheme, pack }) {
  return {
    id: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    email: USER_EMAIL,
    email_confirmed_at: ago(60),
    phone: '',
    confirmed_at: ago(60),
    last_sign_in_at: ago(1),
    app_metadata: { provider: 'email', providers: ['email'] },
    user_metadata: {
      full_name: USER_NAME,
      name: USER_NAME,
      locale: lang,
      prefs: { scheme, pack, measurement: 'original', units: lang === 'en' ? 'us' : 'metric' },
      onboarded_at: ago(60),
    },
    identities: [],
    created_at: ago(60),
    updated_at: ago(1),
    is_anonymous: false,
  };
}

function base64url(value) {
  return Buffer.from(JSON.stringify(value)).toString('base64url');
}

export function fakeSession(user) {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = 60 * 60 * 24 * 30;
  const accessToken = [
    base64url({ alg: 'HS256', typ: 'JWT' }),
    base64url({
      aud: 'authenticated',
      exp: now + expiresIn,
      iat: now,
      iss: `${FAKE_SUPABASE_URL}/auth/v1`,
      sub: user.id,
      email: user.email,
      role: 'authenticated',
      aal: 'aal1',
      session_id: 'b5e5a1d0-0000-4000-8000-000000000001',
      is_anonymous: false,
    }),
    'fake-signature',
  ].join('.');
  return {
    access_token: accessToken,
    token_type: 'bearer',
    expires_in: expiresIn,
    expires_at: now + expiresIn,
    refresh_token: 'fake-refresh-token',
    user,
  };
}
