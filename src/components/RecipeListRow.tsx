import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { RecipeImage } from '@/components/RecipeImage';
import { useThemePreference } from '@/hooks/useThemePreference';
import { formatCostEstimate } from '@/lib/formatCostEstimate';
import { Recipe } from '@/types/recipe';

interface RecipeListRowProps {
  recipe: Recipe;
  onPress: () => void;
  /** Long-press to delete — kept out-of-band from `onPress` so a tap always opens the recipe. */
  onLongPress?: () => void;
  /** Visible delete affordance — parent must confirm before removing. */
  onDelete?: () => void;
  onToggleFavorite?: () => void;
  /** Stagger entrance delay index (list position). */
  index?: number;
}

/** Frosted mist card in the Library list. */
export const RecipeListRow = memo(function RecipeListRow({
  recipe,
  onPress,
  onLongPress,
  onDelete,
  onToggleFavorite,
  index = 0,
}: RecipeListRowProps) {
  const { colors } = useThemePreference();
  const isFavorite = recipe.is_favorite === true;

  const metadata = [
    recipe.estimated_time_minutes != null ? `${recipe.estimated_time_minutes} min` : null,
    recipe.effort_level ?? null,
    recipe.cost_estimate ? formatCostEstimate(recipe.cost_estimate) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <Animated.View entering={FadeInDown.delay(Math.min(index * 60, 360)).springify()}>
      <View
        className="flex-row items-center gap-2 rounded-[28px] p-3.5"
        style={{
          backgroundColor: colors.frosted,
          borderWidth: 1,
          borderColor: colors.frostedBorder,
        }}
      >
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          className="min-w-0 flex-1 flex-row items-center gap-3.5 active:opacity-90"
        >
          {recipe.image_url ? (
            <RecipeImage uri={recipe.image_url} variant="thumb" borderRadius={22} />
          ) : (
            <View
              className="h-[72px] w-[72px] items-center justify-center rounded-[22px]"
              style={{ backgroundColor: colors.primarySoft }}
            >
              <CookieMark size={28} color={colors.primary} />
            </View>
          )}

          <View className="min-w-0 flex-1 pr-1">
            <Text
              className="text-base font-bold leading-5"
              style={{ color: colors.text }}
              numberOfLines={2}
            >
              {recipe.title}
            </Text>
            {metadata.length > 0 && (
              <Text className="mt-1.5 text-sm" style={{ color: colors.textSecondary }}>
                {metadata}
              </Text>
            )}
          </View>
        </Pressable>

        {onToggleFavorite != null && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onToggleFavorite();
            }}
            hitSlop={12}
            className="min-h-[44px] min-w-[44px] items-center justify-center active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel={isFavorite ? 'Remove from favorites' : 'Add to favorites'}
          >
            <Ionicons
              name={isFavorite ? 'heart' : 'heart-outline'}
              size={22}
              color={isFavorite ? colors.primary : colors.textSecondary}
            />
          </Pressable>
        )}

        {onDelete != null && (
          <Pressable
            onPress={(e) => {
              e.stopPropagation?.();
              onDelete();
            }}
            hitSlop={12}
            className="z-10 min-h-[44px] min-w-[44px] items-center justify-center active:opacity-60"
            accessibilityRole="button"
            accessibilityLabel="Delete recipe"
          >
            <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>
    </Animated.View>
  );
});
