import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Text } from '@/components/ui/Text';
import { TileLabel } from '@/components/ui/Tile';
import { Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { macroCalorieShares } from '@shared/lib/recipeNutrition';
import type { RecipeNutrition } from '@shared/types/recipe';

/**
 * Calories, protein, carbs and fat for one serving of the recipe as written, as big numbers. Under each macro, a
 * small meter of its share of the calories in the theme's one colour: its place says which macro it is, so it never
 * depends on telling colours apart (the packs' primary and accent are too close in several themes). Per serving
 * never changes with the servings stepper; the total does, and stays above the ingredients. Like the web's
 * NutritionPanel.
 */
export function RecipeNutritionPanel({ calories, nutrition }: { calories: number; nutrition: RecipeNutrition }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const shares = macroCalorieShares(nutrition);
  const grams = (amount: number) => t('recipe.macroGrams', { amount: amount.toLocaleString() });
  const items = [
    { key: 'calories', label: t('recipe.macroCalories'), value: calories.toLocaleString(), share: null },
    { key: 'protein', label: t('recipe.macroProtein'), value: grams(nutrition.protein_g), share: shares?.protein ?? null },
    { key: 'carbs', label: t('recipe.macroCarbs'), value: grams(nutrition.carbs_g), share: shares?.carbs ?? null },
    { key: 'fat', label: t('recipe.macroFat'), value: grams(nutrition.fat_g), share: shares?.fat ?? null },
  ];
  const heading = t('recipe.perServing');

  return (
    <View
      testID="recipe-nutrition"
      accessible
      accessibilityLabel={`${heading}: ${items.map((item) => `${item.label} ${item.value}`).join(', ')}`}
      style={{
        gap: 10,
        borderRadius: Radii.fact,
        paddingHorizontal: 12,
        paddingVertical: 12,
        backgroundColor: colors.backgroundElement,
      }}
    >
      <TileLabel>{heading}</TileLabel>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
        {items.map((item) => (
          <View key={item.key} style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text
              numberOfLines={1}
              adjustsFontSizeToFit
              style={{
                ...type.font('display', 'bold'),
                fontSize: 22,
                lineHeight: 26,
                letterSpacing: type.tracking(-0.015, 22),
                fontVariant: ['tabular-nums'],
              }}
            >
              {item.value}
            </Text>
            <Text numberOfLines={1} tone="muted" style={{ ...type.font('body', 'semibold'), fontSize: 11, lineHeight: 14 }}>
              {item.label}
            </Text>
            {item.share != null ? (
              <View
                testID="macro-meter"
                style={{ marginTop: 4, height: 6, borderRadius: Radii.pill, backgroundColor: colors.backgroundSelected }}
              >
                <View
                  style={{
                    height: 6,
                    width: `${Math.round(item.share * 100)}%`,
                    minWidth: 6,
                    borderRadius: Radii.pill,
                    backgroundColor: colors.primary,
                  }}
                />
              </View>
            ) : null}
          </View>
        ))}
      </View>
    </View>
  );
}