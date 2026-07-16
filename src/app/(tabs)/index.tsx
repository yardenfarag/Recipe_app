import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, FlatList, Pressable, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeListRow } from '@/components/RecipeListRow';
import { useAuth } from '@/hooks/useAuth';
import { getGuestRecipes } from '@/lib/guestRecipes';
import { signOut } from '@/lib/supabase/auth';
import { fetchRecipes } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function HomeScreen() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const data = user ? await fetchRecipes() : await getGuestRecipes();
      setRecipes(data);
    } catch {
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load]),
  );

  async function handleSignOut() {
    try {
      await signOut();
    } catch (err) {
      Alert.alert('Sign out failed', err instanceof Error ? err.message : 'Please try again.');
    }
  }

  if (loading) {
    return (
      <SafeAreaView className="flex-1 bg-pinch-cream items-center justify-center">
        <ActivityIndicator color="#FF6B35" />
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
      <View className="flex-row items-center justify-between px-5 pt-4 pb-2">
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
      <FlatList
        data={recipes}
        keyExtractor={(item) => item.id}
        renderItem={({ item }) => (
          <RecipeListRow recipe={item} onPress={() => router.push(`/recipe/${item.id}`)} />
        )}
        contentContainerStyle={{ paddingBottom: 24 }}
      />
    </SafeAreaView>
  );
}
