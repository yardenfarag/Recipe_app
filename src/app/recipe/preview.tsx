import { router } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { GUEST_RECIPE_LIMIT, saveGuestRecipe } from '@/lib/guestRecipes';
import { clearRecipeDraft, peekRecipeDraft } from '@/lib/recipeDraft';
import { supabase } from '@/lib/supabase/client';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { saveRecipe } from '@/lib/supabase/recipes';

/**
 * Shows a freshly extracted recipe that has NOT been saved yet.
 * Recipe payload lives in the in-memory draft store (see recipeDraft.ts).
 */
export default function RecipePreviewScreen() {
  const parsed = peekRecipeDraft();
  const [saving, setSaving] = useState(false);
  const [recipeToSave, setRecipeToSave] = useState<ExtractedRecipe | null>(parsed);

  const handleContentChange = useCallback(
    (content: {
      servings: number;
      ingredients: ExtractedRecipe['ingredients'];
      instructions: ExtractedRecipe['instructions'];
      calories?: number;
    }) => {
      setRecipeToSave((prev) => (prev ? { ...prev, ...content } : prev));
    },
    [],
  );

  if (!parsed || !recipeToSave) {
    return (
      <Screen className="items-center justify-center px-6" edges={['bottom']}>
        <Text className="mb-4 text-center text-base text-pinch-muted dark:text-pinch-muted-dark">
          No recipe to preview. Extract one from the Snap tab first.
        </Text>
        <Pressable
          onPress={() => router.replace('/add')}
          className="rounded-full bg-pinch-primary px-5 py-3 active:opacity-80 dark:bg-pinch-primary-dark"
        >
          <Text className="text-sm font-bold text-white">Go to Snap</Text>
        </Pressable>
      </Screen>
    );
  }

  async function handleSave() {
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        const result = await saveGuestRecipe(recipeToSave);

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

        clearRecipeDraft();
        Alert.alert('Saved!', 'This recipe is now in your library.');
        router.replace('/');
        return;
      }

      await saveRecipe(recipeToSave);
      clearRecipeDraft();
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
        recipe={parsed}
        onContentChange={handleContentChange}
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
