import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { RecipeImage } from '@/components/RecipeImage';
import { useThemePreference } from '@/hooks/useThemePreference';
import { formatCostEstimate } from '@/lib/formatCostEstimate';
import { Recipe } from '@/types/recipe';

interface RecipeListRowProps {
  recipe: Recipe;
  onPress: () => void;
  /** Long-press to delete — kept out-of-band from `onPress` so a tap always opens the recipe. */
  onLongPress?: () => void;
}

/** A single card in the Library list (ADR 006): thumbnail, title, and metadata. */
export function RecipeListRow({ recipe, onPress, onLongPress }: RecipeListRowProps) {
  const { colors } = useThemePreference();

  const metadata = [
    recipe.estimated_time_minutes != null ? `${recipe.estimated_time_minutes} min` : null,
    recipe.effort_level ?? null,
    recipe.cost_estimate ? formatCostEstimate(recipe.cost_estimate) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      className="flex-row items-center gap-3.5 rounded-3xl border border-pinch-border bg-pinch-surface p-3 active:opacity-90 dark:border-pinch-border-dark dark:bg-pinch-surface-dark"
    >
      {recipe.image_url ? (
        <RecipeImage uri={recipe.image_url} variant="thumb" />
      ) : (
        <View className="h-[72px] w-[72px] items-center justify-center rounded-[18px] bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
          <Ionicons name="restaurant" size={28} color={colors.primary} />
        </View>
      )}

      <View className="flex-1 pr-1">
        <Text
          className="text-base font-bold leading-5 text-pinch-dark dark:text-pinch-text-dark"
          numberOfLines={2}
        >
          {recipe.title}
        </Text>
        {metadata.length > 0 && (
          <Text className="mt-1.5 text-sm text-pinch-muted dark:text-pinch-muted-dark">
            {metadata}
          </Text>
        )}
      </View>

      <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
    </Pressable>
  );
}
