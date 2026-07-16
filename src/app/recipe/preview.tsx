import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { RecipeView } from '@/components/RecipeView';
import { GUEST_RECIPE_LIMIT, saveGuestRecipe } from '@/lib/guestRecipes';
import { supabase } from '@/lib/supabase/client';
import { saveRecipe } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

/**
 * Shows a freshly extracted recipe that has NOT been saved yet.
 * The `data` param is the JSON-serialized recipe returned by the
 * `extract-recipe` Edge Function (see src/lib/supabase/extractRecipe.ts).
 */
export default function RecipePreviewScreen() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const [saving, setSaving] = useState(false);

  let recipe: Recipe | null = null;
  try {
    recipe = data ? (JSON.parse(data) as Recipe) : null;
  } catch {
    recipe = null;
  }

  if (!recipe) {
    return (
      <SafeAreaView className="flex-1 bg-pinch-cream items-center justify-center px-6">
        <Text className="text-base text-gray-500 text-center">
          Something went wrong loading this recipe.
        </Text>
      </SafeAreaView>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        // ADR 002 — guests get GUEST_RECIPE_LIMIT free local saves, then a sign-up prompt.
        const result = await saveGuestRecipe(recipe!);

        if (!result.ok) {
          // ADR 002 — quota exhausted: prompt sign-up. After signing in, the
          // guest recipes migrate automatically (useAuth) and tapping Save
          // again persists this one to Supabase.
          Alert.alert(
            'Free limit reached',
            `You've saved ${GUEST_RECIPE_LIMIT} recipes as a guest. Sign up to save this one and unlock unlimited recipes.`,
            [
              { text: 'Not now', style: 'cancel' },
              { text: 'Sign up', onPress: () => router.push('/auth') },
            ],
          );
          return;
        }

        Alert.alert('Saved!', 'This recipe is now in your library.');
        router.replace('/');
        return;
      }

      await saveRecipe(recipe!);
      Alert.alert('Saved!', 'This recipe is now in your library.');
      router.replace('/');
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <SafeAreaView className="flex-1 bg-pinch-cream" edges={['bottom']}>
      <RecipeView
        recipe={recipe}
        footer={
          <Pressable
            className="bg-pinch-green rounded-full py-4 items-center mt-2 mb-8"
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-white font-bold text-base">Save Recipe</Text>
            )}
          </Pressable>
        }
      />
    </SafeAreaView>
  );
}
