import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useDeferredValue, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  Text,
  View,
} from 'react-native';

import { RecipeLibraryToolbar } from '@/components/RecipeLibraryToolbar';
import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useRecipes } from '@/hooks/useRecipes';
import { useThemePreference } from '@/hooks/useThemePreference';
import { removeGuestRecipe } from '@/lib/guestRecipes';
import {
  filterAndSortRecipes,
  isRecipeLibraryFiltered,
  RecipeSortKey,
} from '@/lib/recipeListQuery';
import { deleteRecipe } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function HomeScreen() {
  const { user } = useAuth();
  const { recipes, loading, error, refresh, toggleFavorite } = useRecipes();
  const { colors } = useThemePreference();
  const [search, setSearch] = useState('');
  const [sort, setSort] = useState<RecipeSortKey>('newest');
  const deferredSearch = useDeferredValue(search);
  const isSearchPending = search !== deferredSearch;

  const displayedRecipes = useMemo(
    () => filterAndSortRecipes(recipes, deferredSearch, sort),
    [recipes, deferredSearch, sort],
  );

  const hasActiveFilters = isRecipeLibraryFiltered(deferredSearch, sort);

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

  const handleLongPressRecipe = useCallback(
    (recipe: Recipe) => {
      Alert.alert('Delete this recipe?', recipe.title, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              if (recipe.id.startsWith('guest-')) {
                await removeGuestRecipe(recipe.id);
              } else {
                await deleteRecipe(recipe.id);
              }
              refresh();
            } catch (err) {
              Alert.alert(
                'Could not delete',
                err instanceof Error ? err.message : 'Please try again.',
              );
            }
          },
        },
      ]);
    },
    [refresh],
  );

  const openRecipe = useCallback((recipe: Recipe) => {
    router.push(`/recipe/${recipe.id}`);
  }, []);

  const renderItem = useCallback(
    ({ item }: { item: Recipe }) => (
      <RecipeListRow
        recipe={item}
        onPress={() => openRecipe(item)}
        onLongPress={() => handleLongPressRecipe(item)}
        onToggleFavorite={() => handleToggleFavorite(item)}
      />
    ),
    [handleLongPressRecipe, handleToggleFavorite, openRecipe],
  );

  const listHeader = useMemo(
    () => (
      <View className="gap-3 pb-3">
        {error && recipes.length > 0 && (
          <View className="flex-row items-center gap-2 rounded-2xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 dark:border-amber-900 dark:bg-[#3A3420]">
            <Ionicons name="warning-outline" size={16} color={colors.accent} />
            <Text className="flex-1 text-xs text-amber-800 dark:text-amber-200">
              Could not refresh — showing saved recipes.
            </Text>
            <Pressable onPress={() => refresh()} hitSlop={8}>
              <Text className="text-xs font-semibold text-pinch-primary dark:text-pinch-primary-dark">
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        <View>
          <Text className="text-xs font-semibold uppercase tracking-widest text-pinch-rose dark:text-pinch-rose-dark">
            Pinch
          </Text>
          <Text className="text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
            Your recipes
          </Text>
        </View>

        <RecipeLibraryToolbar
          search={search}
          onSearchChange={setSearch}
          sort={sort}
          onSortChange={setSort}
          resultCount={displayedRecipes.length}
          isSearchPending={isSearchPending}
        />

        <View className="flex-row items-center gap-2 rounded-2xl bg-pinch-primary-soft/70 px-3.5 py-2.5 dark:bg-pinch-primary-soft-dark">
          <Ionicons name="hand-left-outline" size={14} color={colors.textSecondary} />
          <Text className="flex-1 text-xs text-pinch-muted dark:text-pinch-muted-dark">
            Long-press a recipe to delete · tap ♥ to save to Favorites
          </Text>
        </View>
      </View>
    ),
    [colors.accent, colors.textSecondary, displayedRecipes.length, error, isSearchPending, recipes.length, refresh, search, sort],
  );

  if (loading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (error && recipes.length === 0) {
    return (
      <Screen className="items-center justify-center px-8">
        <View className="mb-5 h-16 w-16 items-center justify-center rounded-full bg-red-50 dark:bg-[#3A2424]">
          <Ionicons name="cloud-offline-outline" size={32} color={colors.accent} />
        </View>
        <Text className="mb-2 text-center text-xl font-bold text-pinch-dark dark:text-pinch-text-dark">
          Could not load recipes
        </Text>
        <Text className="mb-6 text-center text-sm leading-5 text-pinch-muted dark:text-pinch-muted-dark">
          {error}
        </Text>
        <Pressable
          onPress={() => refresh()}
          className="rounded-full bg-pinch-primary px-6 py-3 active:opacity-80 dark:bg-pinch-primary-dark"
        >
          <Text className="text-base font-bold text-white">Try again</Text>
        </Pressable>
      </Screen>
    );
  }

  if (recipes.length === 0) {
    return (
      <Screen>
        <View className="flex-1 items-center justify-center px-8 pb-10">
          <View className="mb-5 h-20 w-20 items-center justify-center rounded-full bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
            <Ionicons name="restaurant" size={36} color={colors.primary} />
          </View>
          <Text className="mb-2 text-center text-4xl font-bold tracking-tight text-pinch-dark dark:text-pinch-text-dark">
            Pinch
          </Text>
          <Text className="mb-10 text-center text-base leading-6 text-pinch-muted dark:text-pinch-muted-dark">
            Snap recipes from social media and cook something lovely.
          </Text>

          <View className="w-full items-center rounded-3xl border border-pinch-primary-soft bg-pinch-surface p-8 dark:border-pinch-primary-soft-dark dark:bg-pinch-surface-dark">
            <View className="mb-4 h-14 w-14 items-center justify-center rounded-2xl bg-pinch-rose-soft dark:bg-pinch-rose-soft-dark">
              <Ionicons name="sparkles" size={28} color={colors.accent} />
            </View>
            <Text className="mb-2 text-center text-xl font-bold text-pinch-dark dark:text-pinch-text-dark">
              Your kitchen is empty
            </Text>
            <Text className="mb-7 text-center text-sm leading-5 text-pinch-muted dark:text-pinch-muted-dark">
              Paste a YouTube link to extract your first recipe — Instagram and TikTok are coming
              soon.
            </Text>
            <Pressable
              className="w-full items-center rounded-full bg-pinch-primary py-4 active:opacity-80 dark:bg-pinch-primary-dark"
              onPress={() => router.push('/add')}
            >
              <Text className="text-base font-bold text-white">Get started</Text>
            </Pressable>
          </View>

          {!user && (
            <Pressable onPress={() => router.push('/auth')} className="mt-6 active:opacity-70">
              <Text className="text-sm font-semibold text-pinch-primary dark:text-pinch-primary-dark">
                Sign in to sync recipes
              </Text>
            </Pressable>
          )}
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        data={displayedRecipes}
        extraData={recipes}
        keyExtractor={(item) => item.id}
        renderItem={renderItem}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={
          hasActiveFilters ? (
            <View className="items-center px-4 py-10">
              <View className="mb-3 h-14 w-14 items-center justify-center rounded-2xl bg-pinch-primary-soft dark:bg-pinch-primary-soft-dark">
                <Ionicons name="search-outline" size={26} color={colors.primary} />
              </View>
              <Text className="mb-1 text-center text-base font-semibold text-pinch-dark dark:text-pinch-text-dark">
                No matches
              </Text>
              <Text className="mb-5 text-center text-sm text-pinch-muted dark:text-pinch-muted-dark">
                Try a different search or sort option.
              </Text>
              <Pressable
                onPress={() => {
                  setSearch('');
                  setSort('newest');
                }}
                className="rounded-full bg-pinch-primary px-5 py-2.5 active:opacity-80 dark:bg-pinch-primary-dark"
              >
                <Text className="text-sm font-semibold text-white">Clear filters</Text>
              </Pressable>
            </View>
          ) : null
        }
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 10 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        initialNumToRender={8}
        maxToRenderPerBatch={10}
        windowSize={7}
      />
    </Screen>
  );
}
