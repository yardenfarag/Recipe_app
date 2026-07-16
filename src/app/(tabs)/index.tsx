import { router } from 'expo-router';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeListRow } from '@/components/RecipeListRow';
import { pinchOrange } from '@/constants/brandColors';
import { useAuth } from '@/hooks/useAuth';
import { useRecipes } from '@/hooks/useRecipes';
import { removeGuestRecipe } from '@/lib/guestRecipes';
import { signOut } from '@/lib/supabase/auth';
import { deleteRecipe } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function HomeScreen() {
  const { user } = useAuth();
  const { recipes, loading, refresh } = useRecipes();

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      Alert.alert('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  function handleLongPressRecipe(recipe: Recipe) {
    Alert.alert('Delete this recipe?', recipe.title, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            // Guest recipes live in AsyncStorage (ids prefixed "guest-");
            // everything else is a Supabase row — same split used in
            // recipe/[id].tsx for loading a single recipe.
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
      <SafeAreaView className="flex-1 bg-pinch-cream items-center justify-center">
        <ActivityIndicator color={pinchOrange} />
      </SafeAreaView>
    );
  }

  if (recipes.length === 0) {
    return (
      <SafeAreaView className="flex-1 bg-pinch-cream">
        <View className="flex-1 items-center justify-center px-8">
          <Text className="text-6xl mb-4">🍳</Text>
          <Text className="text-3xl font-bold text-pinch-dark text-center mb-2">Pinch</Text>
          <Text className="text-base text-gray-500 text-center mb-10">
            Snap recipes from social media and cook smarter.
          </Text>

          <View className="w-full rounded-2xl bg-white p-8 items-center shadow-sm border border-orange-100">
            <Text className="text-5xl mb-4">📭</Text>
            <Text className="text-xl font-semibold text-pinch-dark mb-2 text-center">
              You have no recipes yet
            </Text>
            <Text className="text-sm text-gray-400 text-center mb-6">
              Paste a TikTok, Instagram, or YouTube link to extract your first recipe.
            </Text>
            <Pressable
              className="bg-pinch-orange rounded-full px-8 py-4 active:opacity-80"
              onPress={() => router.push('/add')}
            >
              <Text className="text-white font-bold text-base">Get Started</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView className="flex-1 bg-pinch-cream">
      <View className="flex-row items-center justify-between px-5 pt-4 pb-1">
        <Text className="text-2xl font-bold text-pinch-dark">Your Recipes</Text>
        {user ? (
          <Pressable onPress={handleSignOut} className="px-3 py-1 active:opacity-70">
            <Text className="text-sm text-pinch-green font-medium">Sign out</Text>
          </Pressable>
        ) : (
          <Pressable onPress={() => router.push('/auth')} className="px-3 py-1 active:opacity-70">
            <Text className="text-sm text-pinch-green font-medium">Sign in</Text>
          </Pressable>
        )}
      </View>
      <Text className="text-xs text-gray-400 px-5 pb-3">Long-press a recipe to delete it</Text>
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
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}
