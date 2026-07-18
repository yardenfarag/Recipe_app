export type RecipeVariantKey =
  | 'healthier'
  | 'vegan'
  | 'vegetarian'
  | 'gluten_free'
  | 'dairy_free'
  | 'low_carb'
  | 'high_protein';

export const RECIPE_VARIANTS: {
  key: RecipeVariantKey;
  label: string;
  icon: string;
  description: string;
}[] = [
  {
    key: 'healthier',
    label: 'Healthier',
    icon: 'leaf-outline',
    description: 'Less fat, sugar, and salt — same dish, lighter.',
  },
  {
    key: 'vegan',
    label: 'Vegan',
    icon: 'nutrition-outline',
    description: 'No animal products at all.',
  },
  {
    key: 'vegetarian',
    label: 'Vegetarian',
    icon: 'heart-outline',
    description: 'No meat or fish.',
  },
  {
    key: 'gluten_free',
    label: 'Gluten-free',
    icon: 'shield-checkmark-outline',
    description: 'Swap wheat and gluten sources.',
  },
  {
    key: 'dairy_free',
    label: 'Dairy-free',
    icon: 'water-outline',
    description: 'No milk, butter, or cheese.',
  },
  {
    key: 'low_carb',
    label: 'Lower carb',
    icon: 'trending-down-outline',
    description: 'Fewer starchy carbs and added sugars.',
  },
  {
    key: 'high_protein',
    label: 'High protein',
    icon: 'barbell-outline',
    description: 'Boost protein while keeping it satisfying.',
  },
];

export function getRecipeVariantLabel(key: RecipeVariantKey): string {
  return RECIPE_VARIANTS.find((v) => v.key === key)?.label ?? key;
}
