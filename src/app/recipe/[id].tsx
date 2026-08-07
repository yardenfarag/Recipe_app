import { useFocusEffect, useNavigation } from '@react-navigation/native';
import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, Text } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { useLocalizedRecipe } from '@/hooks/useLocalizedRecipe';
import { useThemePreference } from '@/hooks/useThemePreference';
import { backfillRecipeThumbnails } from '@/lib/backfillRecipeThumbnails';
import { getGuestRecipeById, updateGuestRecipeContent } from '@/lib/guestRecipes';
import { recipeContentEquals } from '@/lib/recipeContentEquals';
import { toggleRecipeFavorite } from '@/lib/recipeFavorites';
import { fetchRecipeById, updateRecipeContent } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

export default function RecipeDetailScreen() {
  const { t } = useTranslation();
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const [recipe, setRecipe] = useState<Recipe | null | undefined>(undefined);
  const [loadError, setLoadError] = useState<string | null>(null);
  const { colors } = useThemePreference();
  const recipeRef = useRef<Recipe | null>(null);
  const persistQueue = useRef(Promise.resolve());

  const {
    displayContent,
    activeLanguage,
    translating,
    translationError,
    applyManualTranslation,
    loadCached,
  } = useLocalizedRecipe(recipe ?? null, recipe?.id);

  useEffect(() => {
    const title = displayContent?.title ?? recipe?.title;
    if (title) {
      navigation.setOptions({ title });
    }
  }, [navigation, displayContent?.title, recipe?.title]);

  const lastTranslationError = useRef<string | null>(null);
  useEffect(() => {
    if (translationError && translationError !== lastTranslationError.current) {
      lastTranslationError.current = translationError;
      Alert.alert(t('recipe.translateFailedTitle'), translationError);
    }
    if (!translationError) lastTranslationError.current = null;
  }, [translationError, t]);

  const loadRecipe = useCallback(async () => {
    setLoadError(null);

    if (!id) {
      setRecipe(null);
      recipeRef.current = null;
      return;
    }

    try {
      const found = id.startsWith('guest-')
        ? await getGuestRecipeById(id)
        : await fetchRecipeById(id);
      const backfilled = found ? (await backfillRecipeThumbnails([found]))[0] : null;
      setRecipe(backfilled);
      recipeRef.current = backfilled;
    } catch (err) {
      setRecipe(null);
      recipeRef.current = null;
      setLoadError(err instanceof Error ? err.message : t('recipe.loadFailed'));
    }
  }, [id, t]);

  useFocusEffect(
    useCallback(() => {
      setRecipe(undefined);
      void loadRecipe();
    }, [loadRecipe]),
  );

  async function handleToggleFavorite() {
    if (!recipe) return;
    const previous = recipe.is_favorite === true;
    const next = !previous;
    const updated = { ...recipe, is_favorite: next };
    setRecipe(updated);
    recipeRef.current = updated;
    try {
      await toggleRecipeFavorite(recipe, next);
    } catch (err) {
      const rolled = { ...recipe, is_favorite: previous };
      setRecipe(rolled);
      recipeRef.current = rolled;
      Alert.alert(
        t('recipe.favoriteFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    }
  }

  const handleContentChange = useCallback(
    (content: {
      title: string;
      servings: number;
      ingredients: Recipe['ingredients'];
      instructions: Recipe['instructions'];
      calories?: number;
    }) => {
      const current = recipeRef.current;
      if (!current || !id) return;
      if (recipeContentEquals(current, content)) return;

      const optimistic = { ...current, ...content };
      setRecipe(optimistic);
      recipeRef.current = optimistic;

      persistQueue.current = persistQueue.current
        .then(async () => {
          const saved = id.startsWith('guest-')
            ? await updateGuestRecipeContent(id, content)
            : await updateRecipeContent(id, content);
          if (saved) {
            setRecipe(saved);
            recipeRef.current = saved;
          }
        })
        .catch((err) => {
          Alert.alert(
            t('recipe.saveFailedTitle'),
            err instanceof Error ? err.message : t('recipe.saveFailedBody'),
          );
        });
    },
    [id, t],
  );

  if (recipe === undefined) {
    return (
      <Screen className="items-center justify-center" edges={['bottom']}>
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (loadError) {
    return (
      <Screen className="items-center justify-center px-6" edges={['bottom']}>
        <Text className="mb-2 text-center text-base font-semibold" style={{ color: colors.text }}>
          {t('recipe.loadFailedTitle')}
        </Text>
        <Text className="mb-5 text-center text-sm" style={{ color: colors.textSecondary }}>
          {loadError}
        </Text>
        <Pressable
          onPress={() => void loadRecipe()}
          className="rounded-full px-5 py-3 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-sm font-bold text-white">{t('common.tryAgain')}</Text>
        </Pressable>
      </Screen>
    );
  }

  if (!recipe) {
    return (
      <Screen className="items-center justify-center px-6" edges={['bottom']}>
        <Text className="text-center text-base" style={{ color: colors.textSecondary }}>
          {t('recipe.notFound')}
        </Text>
      </Screen>
    );
  }

  return (
    <Screen edges={['bottom']}>
      <RecipeView
        recipe={recipe}
        recipeId={recipe.id}
        isFavorite={recipe.is_favorite === true}
        onToggleFavorite={handleToggleFavorite}
        onContentChange={handleContentChange}
        localizedContent={displayContent}
        localizedLanguage={activeLanguage}
        translating={translating}
        onTranslationPersist={(language, content) => {
          void applyManualTranslation(language, content);
        }}
        getCachedTranslation={loadCached}
      />
    </Screen>
  );
}
