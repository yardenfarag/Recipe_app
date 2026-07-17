import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { GUEST_RECIPE_LIMIT, saveGuestRecipe } from '@/lib/guestRecipes';
import { supabase } from '@/lib/supabase/client';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { saveRecipe } from '@/lib/supabase/recipes';

/**
 * Shows a freshly extracted recipe that has NOT been saved yet.
 * The `data` param is the JSON-serialized recipe returned by the
 * `extract-recipe` Edge Function (see src/lib/supabase/extractRecipe.ts).
 *
 * Typed as `ExtractedRecipe` (not `Recipe`) because this payload has no
 * `id` / `user_id` / `created_at` yet — those only exist once `saveRecipe`
 * or `saveGuestRecipe` persists it.
 */
export default function RecipePreviewScreen() {
  const { data } = useLocalSearchParams<{ data: string }>();
  const [saving, setSaving] = useState(false);

  let recipe: ExtractedRecipe | null = null;
  try {
    recipe = data ? (JSON.parse(data) as ExtractedRecipe) : null;
  } catch {
    recipe = null;
  }

  if (!recipe) {
    return (
      <Screen className="items-center justify-center px-6" edges={['bottom']}>
        <Text className="text-center text-base text-pinch-muted dark:text-pinch-muted-dark">
          Something went wrong loading this recipe.
        </Text>
      </Screen>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        const result = await saveGuestRecipe(recipe!);

        if (!result.ok) {
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
    <Screen edges={['bottom']}>
      <RecipeView
        recipe={recipe}
        footer={
          <Pressable
            className="mb-8 mt-2 items-center rounded-full bg-pinch-primary py-4 active:opacity-80 dark:bg-pinch-primary-dark"
            onPress={handleSave}
            disabled={saving}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-bold text-white">Save recipe</Text>
            )}
          </Pressable>
        }
      />
    </Screen>
  );
}
