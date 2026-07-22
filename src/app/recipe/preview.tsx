import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text, View } from 'react-native';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { useThemePreference } from '@/hooks/useThemePreference';
import { GUEST_RECIPE_LIMIT, saveGuestRecipe } from '@/lib/guestRecipes';
import { clearRecipeDraft, peekRecipeDraft } from '@/lib/recipeDraft';
import { supabase } from '@/lib/supabase/client';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { saveRecipe } from '@/lib/supabase/recipes';

/**
 * Shows a freshly extracted recipe that has NOT been saved yet.
 * Recipe payload lives in the in-memory draft store (see recipeDraft.ts).
 * Save stays fixed at the top so it is not missed while scrolling.
 */
export default function RecipePreviewScreen() {
  const parsed = peekRecipeDraft();
  const { colors } = useThemePreference();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [recipeToSave, setRecipeToSave] = useState<ExtractedRecipe | null>(parsed);

  useEffect(() => {
    navigation.setOptions({
      title: recipeToSave?.title?.trim() || 'Preview',
    });
  }, [navigation, recipeToSave?.title]);

  const handleContentChange = useCallback(
    (content: {
      title: string;
      servings: number;
      ingredients: ExtractedRecipe['ingredients'];
      instructions: ExtractedRecipe['instructions'];
      calories?: number;
    }) => {
      setRecipeToSave((prev) => (prev ? { ...prev, ...content } : prev));
    },
    [],
  );

  if (!recipeToSave) {
    return (
      <Screen className="items-center justify-center px-6" edges={['bottom']}>
        <Text className="mb-4 text-center text-base" style={{ color: colors.textSecondary }}>
          No recipe to preview. Extract one from the Snap tab first.
        </Text>
        <Pressable
          onPress={() => router.replace('/')}
          className="rounded-full px-5 py-3 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-sm font-bold text-white">Go to library</Text>
        </Pressable>
      </Screen>
    );
  }

  async function handleSave() {
    if (!recipeToSave || saveInFlight.current) return;

    saveInFlight.current = true;
    setSaving(true);
    try {
      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        const result = await saveGuestRecipe(recipeToSave);

        if (!result.ok) {
          Alert.alert(
            'Free limit reached',
            `Guest accounts can save up to ${GUEST_RECIPE_LIMIT} recipes (${result.savedCount} saved). Sign up to save more.`,
            [
              { text: 'Not now', style: 'cancel' },
              {
                text: 'Sign up',
                onPress: () => router.push('/auth?mode=signup&reason=save_limit'),
              },
            ],
          );
          return;
        }

        router.replace('/?saved=1');
        clearRecipeDraft();
        return;
      }

      await saveRecipe(recipeToSave);
      router.replace('/?saved=1');
      clearRecipeDraft();
    } catch (err) {
      Alert.alert('Could not save', err instanceof Error ? err.message : 'Please try again.');
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  const displayRecipe: ExtractedRecipe = {
    ...parsed,
    ...recipeToSave,
    title: recipeToSave.title,
  };

  return (
    <Screen edges={['bottom']}>
      <View
        className="border-b px-5 py-3"
        style={{
          backgroundColor: colors.background,
          borderBottomColor: colors.frostedBorder,
        }}
      >
        <Pressable
          className="items-center rounded-full py-3.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
          onPress={handleSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel="Save recipe"
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-base font-bold text-white">Save recipe</Text>
          )}
        </Pressable>
      </View>

      <RecipeView recipe={displayRecipe} onContentChange={handleContentChange} />
    </Screen>
  );
}
