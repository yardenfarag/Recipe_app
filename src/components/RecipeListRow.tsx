import Ionicons from '@expo/vector-icons/Ionicons';
import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { RecipeImage } from '@/components/RecipeImage';
import { useThemePreference } from '@/hooks/useThemePreference';
import { formatCostEstimate } from '@/lib/formatCostEstimate';
import { formatRecipeDuration } from '@/lib/formatRecipeDuration';
import { Recipe } from '@/types/recipe';

interface RecipeListRowProps {
  recipe: Recipe;
  onPress: () => void;
  /** Long-press opens the recipe actions menu (same as ⋯). */
  onLongPress?: () => void;
  /** Overflow menu (add to collection / rename / delete). */
  onMore?: () => void;
  onToggleFavorite?: () => void;
  /** Stagger entrance delay index (list position). */
  index?: number;
  /** `card` stacks image above title for multi-column grids. */
  variant?: 'row' | 'card';
}

/** Frosted mist card in the Library list. */
export const RecipeListRow = memo(function RecipeListRow({
  recipe,
  onPress,
  onLongPress,
  onMore,
  onToggleFavorite,
  index = 0,
  variant = 'row',
}: RecipeListRowProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const isFavorite = recipe.is_favorite === true;

  const metadata = [
    recipe.estimated_time_minutes != null
      ? formatRecipeDuration(recipe.estimated_time_minutes)
      : null,
    recipe.effort_level ?? null,
    recipe.cost_estimate ? formatCostEstimate(recipe.cost_estimate) : null,
  ]
    .filter(Boolean)
    .join(' · ');

  const card = variant === 'card';

  return (
    <Animated.View
      entering={FadeInDown.delay(Math.min(index * 60, 360)).springify()}
      style={card ? { flex: 1 } : undefined}
    >
      <View
        className={
          card
            ? 'overflow-hidden rounded-[28px]'
            : 'flex-row items-center gap-2 rounded-[28px] p-3.5'
        }
        style={{
          backgroundColor: colors.frosted,
          borderWidth: 1,
          borderColor: colors.frostedBorder,
          ...(card ? { flex: 1 } : null),
        }}
      >
        <Pressable
          onPress={onPress}
          onLongPress={onLongPress}
          className={
            card
              ? 'active:opacity-90'
              : 'min-w-0 flex-1 flex-row items-center gap-3.5 active:opacity-90'
          }
        >
          {recipe.image_url ? (
            card ? (
              <RecipeImage
                uri={recipe.image_url}
                variant="hero"
                borderRadius={0}
                style={{ height: 140 }}
              />
            ) : (
              <RecipeImage uri={recipe.image_url} variant="thumb" borderRadius={22} />
            )
          ) : (
            <View
              className={
                card
                  ? 'h-36 w-full items-center justify-center'
                  : 'h-[72px] w-[72px] items-center justify-center rounded-[22px]'
              }
              style={{ backgroundColor: colors.primarySoft }}
            >
              <CookieMark size={card ? 40 : 28} color={colors.primary} />
            </View>
          )}

          <View className={card ? 'gap-1 p-3.5' : 'min-w-0 flex-1 pr-1'}>
            <Text
              className={card ? 'text-[15px] font-bold leading-5' : 'text-base font-bold leading-5'}
              style={{ color: colors.text }}
              numberOfLines={card ? 3 : 2}
            >
              {recipe.display_title ?? recipe.title}
            </Text>
            {metadata.length > 0 && (
              <Text
                className={card ? 'mt-1 text-xs' : 'mt-1.5 text-sm'}
                style={{ color: colors.textSecondary }}
                numberOfLines={card ? 2 : 1}
              >
                {metadata}
              </Text>
            )}
          </View>
        </Pressable>

        {(onToggleFavorite != null || onMore != null) && (
          <View
            className={
              card
                ? 'absolute right-2 top-2 flex-row gap-1'
                : 'flex-row items-center'
            }
          >
            {onToggleFavorite != null && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onToggleFavorite();
                }}
                hitSlop={12}
                className="min-h-[40px] min-w-[40px] items-center justify-center rounded-full active:opacity-60"
                style={card ? { backgroundColor: colors.frosted } : undefined}
                accessibilityRole="button"
                accessibilityLabel={
                  isFavorite ? t('library.removeFavorite') : t('library.addFavorite')
                }
              >
                <Ionicons
                  name={isFavorite ? 'heart' : 'heart-outline'}
                  size={22}
                  color={isFavorite ? colors.primary : colors.textSecondary}
                />
              </Pressable>
            )}

            {onMore != null && (
              <Pressable
                onPress={(e) => {
                  e.stopPropagation?.();
                  onMore();
                }}
                hitSlop={12}
                className="z-10 min-h-[40px] min-w-[40px] items-center justify-center rounded-full active:opacity-60"
                style={card ? { backgroundColor: colors.frosted } : undefined}
                accessibilityRole="button"
                accessibilityLabel={t('library.recipeActions')}
              >
                <Ionicons name="ellipsis-vertical" size={18} color={colors.textSecondary} />
              </Pressable>
            )}
          </View>
        )}
      </View>
    </Animated.View>
  );
});
