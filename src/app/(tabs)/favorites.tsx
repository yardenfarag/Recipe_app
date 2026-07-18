import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useMemo } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';

import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { useRecipes } from '@/hooks/useRecipes';
import { useThemePreference } from '@/hooks/useThemePreference';
import { getFavoriteRecipes } from '@/lib/recipeListQuery';
import { Recipe } from '@/types/recipe';

export default function FavoritesScreen() {
  const { recipes, loading, toggleFavorite } = useRecipes();
  const { colors } = useThemePreference();

  const favoriteRecipes = useMemo(() => getFavoriteRecipes(recipes), [recipes]);

  const handleToggleFavorite = useCallback(
    async (recipe: Recipe) => {
      try {
        await toggleFavorite(recipe);
      } catch (err) {
        Alert.alert(
          'Could not update favorite',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    },
    [toggleFavorite],
  );

  const openRecipe = useCallback((recipe: Recipe) => {
    router.push(`/recipe/${recipe.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Recipe }) => (
      <RecipeListRow
        recipe={item}
        onPress={() => openRecipe(item)}
        onToggleFavorite={() => handleToggleFavorite(item)}
      />
    ),
    [handleToggleFavorite, openRecipe],
  );

  if (loading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (favoriteRecipes.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8 pb-10">
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-pinch-rose-soft dark:bg-pinch-rose-soft-dark">
            <Ionicons name="heart-outline" size={36} color={colors.accent} />
          </View>
          <Text className="mb-2 text-center text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
            No favorites yet
          </Text>
          <Text className="mb-8 text-center text-base leading-6 text-pinch-muted dark:text-pinch-muted-dark">
            Tap the heart on any recipe in your library to save it here for quick access.
          </Text>
          <Pressable
            className="rounded-full bg-pinch-primary px-6 py-3.5 active:opacity-80 dark:bg-pinch-primary-dark"
            onPress={() => router.push('/(tabs)')}
          >
            <Text className="text-base font-bold text-white">Browse library</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={favoriteRecipes}
        extraData={recipes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={
          <View className="pb-3">
            <Text className="text-xs font-semibold uppercase tracking-widest text-pinch-rose dark:text-pinch-rose-dark">
              Pinch
            </Text>
            <Text className="text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
              Favorites
            </Text>
            <Text className="mt-1 text-sm text-pinch-muted dark:text-pinch-muted-dark">
              {favoriteRecipes.length} saved recipe{favoriteRecipes.length === 1 ? '' : 's'}
            </Text>
          </View>
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 10 }}
        showsVerticalScrollIndicator={false}
        initialNumToRender={8}
      />
    </Screen>
  );
}
