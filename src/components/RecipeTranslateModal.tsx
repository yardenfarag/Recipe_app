import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { localizeIngredientUnits } from '@/lib/culinaryUnits';
import {
  RECIPE_LANGUAGES,
  RecipeLanguageCode,
} from '@/lib/recipeLanguages';
import {
  translateRecipe,
  TranslatedRecipePayload,
} from '@/lib/supabase/translateRecipe';
import { Ingredient, Instruction, RecipeTranslationContent } from '@/types/recipe';

interface RecipeTranslateModalProps {
  visible: boolean;
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  activeLanguage: RecipeLanguageCode | null;
  /** Optional cache lookup before calling Gemini. */
  getCachedTranslation?: (
    language: RecipeLanguageCode,
  ) => Promise<RecipeTranslationContent | null> | RecipeTranslationContent | null;
  onClose: () => void;
  onApply: (
    result: TranslatedRecipePayload,
    language: RecipeLanguageCode,
  ) => void | Promise<void>;
  onShowOriginal: () => void;
}

/**
 * Sheet for translating recipe content into one of the supported languages.
 * Always translates from the provided source (canonical) content.
 */
export function RecipeTranslateModal({
  visible,
  title,
  ingredients,
  instructions,
  activeLanguage,
  getCachedTranslation,
  onClose,
  onApply,
  onShowOriginal,
}: RecipeTranslateModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { chevronForward } = useRtl();
  const [loadingLanguage, setLoadingLanguage] = useState<RecipeLanguageCode | null>(null);
  const [error, setError] = useState<string | null>(null);

  function handleClose() {
    if (loadingLanguage) return;
    setError(null);
    onClose();
  }

  async function handleSelectLanguage(language: RecipeLanguageCode) {
    if (loadingLanguage) return;
    if (activeLanguage === language) {
      onClose();
      return;
    }

    setLoadingLanguage(language);
    setError(null);

    try {
      const cached = (await getCachedTranslation?.(language)) ?? null;
      if (cached) {
        await onApply(
          {
            ...cached,
            ingredients: localizeIngredientUnits(cached.ingredients, language),
          },
          language,
        );
        setError(null);
        onClose();
        return;
      }

      const result = await translateRecipe(language, {
        title,
        ingredients,
        instructions,
      });

      if (result.status === 'failed' || !result.recipe) {
        setError(
          result.code === 'daily_limit'
            ? t('recipe.translateDailyLimit')
            : (result.message ?? t('recipe.translateFailedTitle')),
        );
        return;
      }

      await onApply(result.recipe, language);
      setError(null);
      onClose();
    } catch {
      setError(t('recipe.translationSaveFailed'));
    } finally {
      setLoadingLanguage(null);
    }
  }

  function handleShowOriginal() {
    if (loadingLanguage) return;
    onShowOriginal();
    setError(null);
    onClose();
  }

  return (
    <SheetModal
      visible={visible}
      onClose={handleClose}
      title={t('recipe.translateTitle')}
      maxWidth={480}
    >
      <Text className="mb-3 px-5 text-sm leading-5" style={{ color: colors.textSecondary }}>
        {t('recipe.translateHint')}
      </Text>

      {error ? (
        <Text className="mb-3 px-5 text-sm" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}

      <ScrollView className="flex-1 px-5" contentContainerStyle={{ paddingBottom: 32 }}>
        {activeLanguage != null && (
          <Pressable
            onPress={handleShowOriginal}
            disabled={Boolean(loadingLanguage)}
            className="mb-3 flex-row items-center justify-between rounded-2xl border px-4 py-3.5 active:opacity-80"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
          >
            <View className="flex-1" style={{ paddingEnd: 12 }}>
              <Text className="text-base font-semibold" style={{ color: colors.text }}>
                {t('recipe.originalLanguage')}
              </Text>
              <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                {t('recipe.originalLanguageHint')}
              </Text>
            </View>
            <Ionicons name="arrow-undo-outline" size={18} color={colors.primary} />
          </Pressable>
        )}

        {RECIPE_LANGUAGES.map((lang) => {
          const selected = activeLanguage === lang.code;
          const loading = loadingLanguage === lang.code;
          return (
            <Pressable
              key={lang.code}
              onPress={() => void handleSelectLanguage(lang.code)}
              disabled={Boolean(loadingLanguage)}
              className="mb-2.5 flex-row items-center justify-between rounded-2xl border px-4 py-3.5 active:opacity-80"
              style={{
                backgroundColor: selected ? colors.primarySoft : colors.surface,
                borderColor: selected ? colors.primary : colors.border,
              }}
            >
              <View className="flex-1" style={{ paddingEnd: 12 }}>
                <Text className="text-base font-semibold" style={{ color: colors.text }}>
                  {lang.nativeLabel}
                </Text>
                {t(`languages.${lang.code}`) !== lang.nativeLabel ? (
                  <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                    {t(`languages.${lang.code}`)}
                  </Text>
                ) : null}
              </View>
              {loading ? (
                <ActivityIndicator color={colors.primary} />
              ) : selected ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
              ) : (
                <Ionicons name={chevronForward} size={18} color={colors.textSecondary} />
              )}
            </Pressable>
          );
        })}
      </ScrollView>
    </SheetModal>
  );
}
