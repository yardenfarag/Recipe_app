import { Image } from 'expo-image';
import { Pressable, Text, View } from 'react-native';

import { formatCostEstimate } from '@/lib/formatCostEstimate';
import { Recipe } from '@/types/recipe';

interface RecipeListRowProps {
  recipe: Recipe;
  onPress: () => void;
  /** Long-press to delete — kept out-of-band from `onPress` so a tap always opens the recipe. */
  onLongPress?: () => void;
}

/** A single row in the Library list (ADR 006): thumbnail, title, and metadata. */
export function RecipeListRow({ recipe, onPress, onLongPress }: RecipeListRowProps) {
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
      className="flex-row items-center gap-3 px-4 py-3 bg-white border-b border-gray-100 active:bg-gray-50"
    >
      {recipe.image_url ? (
        <Image
          source={{ uri: recipe.image_url }}
          style={{ width: 64, height: 64, borderRadius: 12 }}
          contentFit="cover"
        />
      ) : (
        <View className="w-16 h-16 rounded-xl bg-orange-100 items-center justify-center">
          <Text className="text-2xl">🍽️</Text>
        </View>
      )}

      <View className="flex-1">
        <Text className="text-base font-bold text-pinch-dark" numberOfLines={1}>
          {recipe.title}
        </Text>
        {metadata.length > 0 && <Text className="text-sm text-gray-500 mt-1">{metadata}</Text>}
      </View>
    </Pressable>
  );
}
