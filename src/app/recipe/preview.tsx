import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useLocalizedRecipe } from '@/hooks/useLocalizedRecipe';
import { useThemePreference } from '@/hooks/useThemePreference';
import { captureRecipeSaved } from '@/lib/analytics';
import { DEFAULT_SOURCE_LANGUAGE } from '@shared/lib/appLanguages';
import { confirmAction, showNotice } from '@/lib/confirmAction';
import { ensureRecipeTranslation } from '@/lib/ensureRecipeTranslation';
import { goBackOrHome } from '@/lib/goBackOrHome';
import { recipeContentEquals } from '@shared/lib/recipeContentEquals';
import { recipeIsInvented } from '@shared/lib/recipeOrigin';
import {
  clearRecipeDraft,
  getRecipeDraft,
  peekRecipeDraft,
  setRecipeDraft,
} from '@/lib/recipeDraft';
import { isRecipeLanguageCode } from '@shared/lib/recipeLanguages';
import { resolveRecipeSourceLanguage } from '@shared/lib/recipeSourceLanguage';
import { saveRecipeDraft } from '@/lib/saveRecipeDraft';
import { supabase } from '@/lib/supabase/client';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import type { RepairedRecipePayload } from '@/lib/supabase/repairRecipe';
import { upsertRecipeTranslation } from '@shared/lib/supabase/recipeTranslations';
import type { RecipeTranslationContent } from '@shared/types/recipe';

/**
 * Shows a freshly extracted recipe that has NOT been saved yet.
 * Recipe payload lives in the in-memory draft store (see recipeDraft.ts).
 * The recipe page's layout (PIN-177): Save stays fixed at the bottom so it is not missed while scrolling, and
 * "Discard" is in the more menu.
 */
export default function RecipePreviewScreen() {
  const { t } = useTranslation();
  const initialDraft = useRef(peekRecipeDraft()).current;
  const { colors } = useThemePreference();
  const { language: preferredLanguage } = useLanguagePreference();
  const navigation = useNavigation();
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [recipeToSave, setRecipeToSave] = useState<ExtractedRecipe | null>(() =>
    initialDraft
      ? {
          ...initialDraft,
          source_language: initialDraft.source_language ?? DEFAULT_SOURCE_LANGUAGE,
        }
      : null,
  );
  const [draftLoading, setDraftLoading] = useState(initialDraft === null);
  const pendingTranslation = useRef<{
    language: string;
    content: RecipeTranslationContent;
  } | null>(null);

  useEffect(() => {
    if (initialDraft) return;

    let active = true;
    void getRecipeDraft()
      .then((stored) => {
        if (active && stored) {
          setRecipeToSave({
            ...stored,
            source_language: stored.source_language ?? DEFAULT_SOURCE_LANGUAGE,
          });
        }
      })
      .finally(() => {
        if (active) setDraftLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialDraft]);

  const {
    displayContent,
    activeLanguage,
    translating,
    applyManualTranslation,
  } = useLocalizedRecipe(recipeToSave, undefined);

  useEffect(() => {
    navigation.setOptions({
      title: displayContent?.title?.trim() || recipeToSave?.title?.trim() || t('recipe.preview'),
    });
  }, [navigation, displayContent?.title, recipeToSave?.title, t]);

  useEffect(() => {
    if (displayContent && activeLanguage) {
      pendingTranslation.current = { language: activeLanguage, content: displayContent };
    } else {
      pendingTranslation.current = null;
    }
  }, [displayContent, activeLanguage]);

  const handleContentChange = useCallback(
    (content: {
      title: string;
      servings: number;
      ingredients: ExtractedRecipe['ingredients'];
      instructions: ExtractedRecipe['instructions'];
      calories?: number;
      nutrition?: ExtractedRecipe['nutrition'];
      kitchen_adapted_summary?: string | null;
      kitchen_original?: ExtractedRecipe['kitchen_original'] | null;
      /** Only present when a remix or revert changes them (ADR 017). */
      appliances?: ExtractedRecipe['appliances'];
      /** Only present when the text is in another language than the recipe's so far (PIN-187). */
      source_language?: string;
    }) => {
      setRecipeToSave((prev) => {
        if (!prev) return prev;
        const kitchenTouched = content.kitchen_adapted_summary !== undefined;
        const languageChanged =
          content.source_language !== undefined && content.source_language !== prev.source_language;
        if (recipeContentEquals(prev, content) && !kitchenTouched && !languageChanged) return prev;
        const {
          kitchen_adapted_summary: kitchenSummary,
          kitchen_original: kitchenOriginal,
          ...rest
        } = content;
        const next: ExtractedRecipe = { ...prev, ...rest };
        if (kitchenSummary === null) {
          delete next.kitchen_adapted_summary;
          delete next.kitchen_original;
        } else if (kitchenSummary !== undefined) {
          next.kitchen_adapted_summary = kitchenSummary;
          if (kitchenOriginal) next.kitchen_original = kitchenOriginal;
        }
        void setRecipeDraft(next).catch((error) => {
          console.warn('[recipe-draft] update persistence failed', error);
        });
        return next;
      });
    },
    [],
  );

  const handleRepairApplied = useCallback((repaired: RepairedRecipePayload) => {
    setRecipeToSave((prev) => {
      if (!prev) return prev;
      const next: ExtractedRecipe = {
        ...prev,
        title: repaired.title,
        servings: repaired.servings,
        ingredients: repaired.ingredients,
        instructions: repaired.instructions,
        calories: repaired.calories,
        nutrition: repaired.nutrition ?? null,
        estimated_time_minutes: repaired.estimated_time_minutes,
        cost_estimate: repaired.cost_estimate,
        effort_level: repaired.effort_level,
        extraction_status: repaired.extraction_status,
        tags: repaired.tags ?? prev.tags,
        missing_fields: repaired.missing_fields,
        source_language: repaired.source_language ?? prev.source_language,
        ...(repaired.appliances !== undefined ? { appliances: repaired.appliances } : {}),
      };
      void setRecipeDraft(next).catch((error) => {
        console.warn('[recipe-draft] repair persistence failed', error);
      });
      return next;
    });
  }, []);

  // The page has no header (the photo runs to the top), so the states before the recipe bring their own way back.
  const backRow = (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16, paddingTop: 8 }}>
      <IconButton
        variant="tile"
        icon="arrow-back"
        label={t('common.back')}
        trackId="recipe_preview.back"
        onPress={() => goBackOrHome('/')}
      />
    </View>
  );

  if (draftLoading) {
    return (
      <Screen edges={['top', 'bottom']}>
        {backRow}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
        </View>
      </Screen>
    );
  }

  if (!recipeToSave) {
    return (
      <Screen edges={['top', 'bottom']}>
        {backRow}
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
          <Text variant="body" tone="muted" align="center">
            {t('recipe.noPreview')}
          </Text>
          <Button trackId="recipe_preview.go_home" onPress={() => router.dismissTo('/')} style={{ alignSelf: 'center' }}>
            {t('recipe.goToLibrary')}
          </Button>
        </View>
      </Screen>
    );
  }

  async function handleDiscard() {
    const discard = await confirmAction(
      t('web.snap.discardTitle'),
      t('web.snap.discardBody'),
      t('web.snap.discard'),
      t('common.cancel'),
    );
    if (!discard) return;
    try {
      await clearRecipeDraft();
    } catch (error) {
      console.warn('[recipe-draft] discard failed', error);
    }
    goBackOrHome('/add');
  }

  async function handleSave() {
    if (!recipeToSave || saveInFlight.current) return;

    saveInFlight.current = true;
    setSaving(true);
    try {
      const canonical: ExtractedRecipe = {
        ...recipeToSave,
        source_language: recipeToSave.source_language ?? DEFAULT_SOURCE_LANGUAGE,
      };

      // Eager translate at save if preferred language differs and we don't have overlay yet.
      let translation = pendingTranslation.current;
      if (
        !translation &&
        preferredLanguage !== resolveRecipeSourceLanguage(canonical)
      ) {
        const result = await ensureRecipeTranslation({
          recipe: canonical,
          targetLanguage: preferredLanguage,
        });
        if (result.status === 'ok') {
          translation = { language: preferredLanguage, content: result.content };
        }
      }

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        router.push('/auth?mode=signup&reason=save_limit');
        return;
      }

      const { recipe: saved, recoveredDuplicate } = await saveRecipeDraft(canonical);
      if (!recoveredDuplicate) {
        captureRecipeSaved({ from: recipeIsInvented(canonical) ? 'invent' : 'extract', save: 'manual' });
      }
      if (translation && isRecipeLanguageCode(translation.language)) {
        try {
          await upsertRecipeTranslation(saved.id, translation.language, translation.content);
        } catch {
          Alert.alert(t('recipe.saveFailedTitle'), t('recipe.translationSaveFailed'));
        }
      }
      try {
        await clearRecipeDraft();
      } catch (error) {
        console.warn('[recipe-draft] cleanup failed', error);
      }
      if (recoveredDuplicate) {
        await showNotice(t('recipe.saveFailedTitle'), t('recipe.alreadySaved'));
        router.replace(`/recipe/${saved.id}`);
      } else {
        router.dismissTo('/?saved=1');
      }
    } catch (err) {
      Alert.alert(
        t('recipe.saveFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  return (
    <Screen edges={[]}>
      <RecipeView
        immersive
        onBack={() => goBackOrHome('/')}
        primaryAction={{
          label: t('recipe.save'),
          onPress: () => void handleSave(),
          busy: saving,
          trackId: 'recipe_preview.save',
        }}
        onDiscard={() => void handleDiscard()}
        recipe={recipeToSave}
        onContentChange={handleContentChange}
        onRepairApplied={handleRepairApplied}
        localizedContent={displayContent}
        localizedLanguage={activeLanguage}
        translating={translating}
        onTranslationPersist={(language, content) => {
          pendingTranslation.current = { language, content };
          return applyManualTranslation(language, content);
        }}
      />
    </Screen>
  );
}

