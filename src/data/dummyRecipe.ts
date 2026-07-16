import { Recipe } from '@/types/recipe';

export const dummyRecipe: Recipe = {
  id: 'dummy-1',
  title: 'Garlic Butter Pasta',
  original_url: 'https://tiktok.com/@chef/example',
  platform: 'tiktok',
  image_url: 'https://images.unsplash.com/photo-1621996346565-e3dbc646d9a9?w=800',
  extraction_status: 'full',
  servings: 2,
  calories: 520,
  estimated_time_minutes: 20,
  cost_estimate: '$',
  effort_level: 'Easy',
  ingredients: [
    { name: 'spaghetti', quantity: 200, unit: 'g' },
    { name: 'butter', quantity: 3, unit: 'tbsp' },
    { name: 'garlic cloves', quantity: 4, unit: 'cloves' },
    { name: 'parmesan', quantity: 0.25, unit: 'cup' },
    { name: 'olive oil', quantity: 1, unit: 'tbsp' },
    { name: 'parsley', quantity: 2, unit: 'tbsp' },
  ],
  instructions: [
    { step: 1, text: 'Boil pasta in salted water until al dente. Reserve 1 cup pasta water.' },
    { step: 2, text: 'Sauté minced garlic in butter and olive oil until fragrant, about 1 minute.' },
    { step: 3, text: 'Toss drained pasta with garlic butter. Add pasta water to loosen sauce.' },
    { step: 4, text: 'Finish with parmesan and chopped parsley. Serve immediately.' },
  ],
};
