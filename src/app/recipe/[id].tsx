import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { useThemePreference } from '@/hooks/useThemePreference';
import { getGuestRecipeById } from '@/lib/guestRecipes';
import { fetchRecipeById } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const { colors } = useThemePreference();

  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!id) {
        if (isMounted) setRecipe(null);
        return;
      }
      const found = id.startsWith('guest-')
        ? await getGuestRecipeById(id)
        : await fetchRecipeById(id).catch(() => null);
      if (isMounted) setRecipe(found);
    })();

    return () => {
      isMounted = false;
    };
  }, [id]);

  if (recipe === undefined) {
    return (
      <Screen className="items-center justify-center" edges={['bottom']}>
        <ActivityIndicator color={colors.primary} size="large" />
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
      <RecipeView recipe={recipe} />
    </Screen>
  );
}
