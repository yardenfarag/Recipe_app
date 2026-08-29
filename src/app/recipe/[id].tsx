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
import { getGuestRecipeById, setGuestRecipeCooked, updateGuestRecipeContent } from '@/lib/guestRecipes';
import { recipeContentEquals } from '@/lib/recipeContentEquals';
import { toggleRecipeFavorite } from '@/lib/recipeFavorites';
import { fetchRecipeById, setRecipeCooked, updateRecipeContent } from '@/lib/supabase/recipes';
import type { RepairedRecipePayload } from '@/lib/supabase/repairRecipe';
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
      kitchen_adapted_summary?: string | null;
      kitchen_original?: Recipe['kitchen_original'] | null;
    }) => {
      const current = recipeRef.current;
      if (!current || !id) return;
      const kitchenTouched = content.kitchen_adapted_summary !== undefined;
      if (recipeContentEquals(current, content) && !kitchenTouched) return;

      const { kitchen_adapted_summary: kitchenSummary, kitchen_original: kitchenOriginal, ...rest } =
        content;
      const optimistic: Recipe = { ...current, ...rest };
      if (kitchenSummary === null) {
        delete optimistic.kitchen_adapted_summary;
        delete optimistic.kitchen_original;
      } else if (kitchenSummary !== undefined) {
        optimistic.kitchen_adapted_summary = kitchenSummary;
        if (kitchenOriginal) optimistic.kitchen_original = kitchenOriginal;
      }
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

  const handleCookedChange = useCallback(
    (cooked: { last_cooked_at: string; cook_note: string }) => {
      const current = recipeRef.current;
      if (!current || !id) return;
      const optimistic = {
        ...current,
        last_cooked_at: cooked.last_cooked_at,
        cook_note: cooked.cook_note || undefined,
      };
      setRecipe(optimistic);
      recipeRef.current = optimistic;

      persistQueue.current = persistQueue.current
        .then(async () => {
          const saved = id.startsWith('guest-')
            ? await setGuestRecipeCooked(id, cooked)
            : await setRecipeCooked(id, cooked);
          if (saved) {
            setRecipe(saved);
            recipeRef.current = saved;
          }
        })
        .catch((err) => {
          Alert.alert(
            t('recipe.cookedSaveFailed'),
            err instanceof Error ? err.message : t('common.tryAgain'),
          );
        });
    },
    [id, t],
  );

  const handleRepairApplied = useCallback(
    (repaired: RepairedRecipePayload) => {
      const current = recipeRef.current;
      if (!current || !id) return;
      const optimistic = {
        ...current,
        ...repaired,
        calories: repaired.calories ?? undefined,
        estimated_time_minutes: repaired.estimated_time_minutes ?? undefined,
        cost_estimate: repaired.cost_estimate ?? undefined,
        effort_level: repaired.effort_level ?? undefined,
      };
      setRecipe(optimistic);
      recipeRef.current = optimistic;

      persistQueue.current = persistQueue.current
        .then(async () => {
          const persistable = {
            title: repaired.title,
            servings: repaired.servings,
            ingredients: repaired.ingredients,
            instructions: repaired.instructions,
            calories: repaired.calories,
            extraction_status: repaired.extraction_status,
            missing_fields: repaired.missing_fields,
            estimated_time_minutes: repaired.estimated_time_minutes,
            cost_estimate: repaired.cost_estimate,
            effort_level: repaired.effort_level,
            tags: repaired.tags,
          };
          const saved = id.startsWith('guest-')
            ? await updateGuestRecipeContent(id, persistable)
            : await updateRecipeContent(id, persistable);
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
        onCookedChange={handleCookedChange}
        onRepairApplied={handleRepairApplied}
        localizedContent={displayContent}
        localizedLanguage={activeLanguage}
        translating={translating}
        onTranslationPersist={(language, content) => {
          return applyManualTranslation(language, content);
        }}
        getCachedTranslation={loadCached}
      />
    </Screen>
  );
}
