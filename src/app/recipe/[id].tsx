import { useFocusEffect } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { useThemePreference } from '@/hooks/useThemePreference';
import { backfillRecipeThumbnails } from '@/lib/backfillRecipeThumbnails';
import { getGuestRecipeById } from '@/lib/guestRecipes';
import { toggleRecipeFavorite } from '@/lib/recipeFavorites';
import { fetchRecipeById } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { colors } = useThemePreference();

  const loadRecipe = useCallback(async () => {
    setLoadError(null);

    if (!id) {
      setRecipe(null);
      return;
    }

    try {
      const found = id.startsWith('guest-')
        ? await getGuestRecipeById(id)
        : await fetchRecipeById(id).catch(() => null);
      const backfilled = found ? (await backfillRecipeThumbnails([found]))[0] : null;
      setRecipe(backfilled);
    } catch (err) {
      setRecipe(null);
      setLoadError(err instanceof Error ? err.message : 'Could not load this recipe.');
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      setRecipe(undefined);
      void loadRecipe();
    }, [loadRecipe]),
  );

  async function handleToggleFavorite() {
    if (!recipe) return;
    const previous = recipe.is_favorite === true;
    const next = !previous;
    setRecipe({ ...recipe, is_favorite: next });
    try {
      await toggleRecipeFavorite(recipe, next);
    } catch (err) {
      setRecipe({ ...recipe, is_favorite: previous });
      Alert.alert(
        'Could not update favorite',
        err instanceof Error ? err.message : 'Please try again.',
      );
    }
  }

  if (recipe === undefined) {
    return (
      <Screen className="items-center justify-center" edges={['bottom']}>
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen className="items-center justify-center px-6" edges={['bottom']}>
        <Text className="mb-2 text-center text-base font-semibold text-pinch-dark dark:text-pinch-text-dark">
          Could not load recipe
        </Text>
        <Text className="mb-5 text-center text-sm text-pinch-muted dark:text-pinch-muted-dark">
          {loadError}
        </Text>
        <Pressable
          onPress={() => void loadRecipe()}
          className="rounded-full bg-pinch-primary px-5 py-3 active:opacity-80 dark:bg-pinch-primary-dark"
        >
          <Text className="text-sm font-bold text-white">Try again</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!recipe) {
    return (
      <Screen className="items-center justify-center px-6" edges={['bottom']}>
        <Text className="text-center text-base text-pinch-muted dark:text-pinch-muted-dark">
          Recipe not found.
        </Text>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <RecipeView
        recipe={recipe}
        isFavorite={recipe.is_favorite === true}
        onToggleFavorite={handleToggleFavorite}
      />
    </Screen>
  );
}
