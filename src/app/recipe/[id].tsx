import { useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeView } from '@/components/RecipeView';
import { pinchOrange } from '@/constants/brandColors';
import { getGuestRecipeById } from '@/lib/guestRecipes';
import { fetchRecipeById } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function RecipeDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);

  useEffect(() => {
    let isMounted = true;

    (async () => {
      if (!id) {
        if (isMounted) setRecipe(null);
        return;
      }
      // Guest recipes live in AsyncStorage (ids prefixed "guest-"); everything
      // else is a Supabase row.
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
      <SafeAreaView className="flex-1 bg-pinch-cream items-center justify-center">
        <ActivityIndicator color={pinchOrange} />
      </SafeAreaView>
    );
  }

  if (!recipe) {
    return (
      <SafeAreaView className="flex-1 bg-pinch-cream items-center justify-center px-6">
        <Text className="text-base text-gray-500 text-center">Recipe not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-pinch-cream" edges={['bottom']}>
      <RecipeView recipe={recipe} />
    </SafeAreaView>
  );
}
