import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';

import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { useAuth } from '@/hooks/useAuth';
import { useRecipes } from '@/hooks/useRecipes';
import { useThemePreference } from '@/hooks/useThemePreference';
import { removeGuestRecipe } from '@/lib/guestRecipes';
import { deleteRecipe } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function HomeScreen() {
  const { user } = useAuth();
  const { recipes, loading, refresh } = useRecipes();
  const { colors } = useThemePreference();

  function handleLongPressRecipe(recipe: Recipe) {
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
  }

  if (loading) {
    return (
      <Screen className="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
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
              Paste a TikTok, Instagram, or YouTube link to extract your first recipe.
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
      <View className="px-5 pb-1 pt-3">
        <Text className="text-xs font-semibold uppercase tracking-widest text-pinch-rose dark:text-pinch-rose-dark">
          Pinch
        </Text>
        <Text className="text-2xl font-bold text-pinch-dark dark:text-pinch-text-dark">
          Your recipes
        </Text>
      </View>

      <View className="mx-5 mb-3 mt-2 flex-row items-center gap-2 rounded-2xl bg-pinch-primary-soft/70 px-3.5 py-2.5 dark:bg-pinch-primary-soft-dark">
        <Ionicons name="hand-left-outline" size={14} color={colors.textSecondary} />
        <Text className="flex-1 text-xs text-pinch-muted dark:text-pinch-muted-dark">
          Long-press a recipe to delete it
        </Text>
      </View>

      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecipeListRow
            recipe={item}
            onPress={() => router.push(`/recipe/${item.id}`)}
            onLongPress={() => handleLongPressRecipe(item)}
          />
        )}
        contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 28, gap: 10 }}
        showsVerticalScrollIndicator={false}
      />
    </Screen>
  );
}
