import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import {
  getRecipeLanguageLabel,
  RECIPE_LANGUAGES,
  RecipeLanguageCode,
} from '@/lib/recipeLanguages';
import {
  translateRecipe,
  TranslatedRecipePayload,
} from '@/lib/supabase/translateRecipe';
import { Ingredient, Instruction } from '@/types/recipe';

interface RecipeTranslateModalProps {
  visible: boolean;
  title: string;
  ingredients: Ingredient[];
  instructions: Instruction[];
  activeLanguage: RecipeLanguageCode | null;
  onClose: () => void;
  onApply: (result: TranslatedRecipePayload, language: RecipeLanguageCode) => void;
  onShowOriginal: () => void;
}

/**
 * Sheet for translating recipe content into one of the supported languages.
 * Always sends the currently displayed content to Gemini.
 */
export function RecipeTranslateModal({
  visible,
  title,
  ingredients,
  instructions,
  activeLanguage,
  onClose,
  onApply,
  onShowOriginal,
}: RecipeTranslateModalProps) {
  const { colors } = useThemePreference();
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
      const result = await translateRecipe(language, {
        title,
        ingredients,
        instructions,
      });

      if (result.status === 'failed' || !result.recipe) {
        setError(result.message ?? "Couldn't translate this recipe. Try again.");
        return;
      }

      onApply(result.recipe, language);
      setError(null);
      onClose();
    } catch {
      setError("Couldn't translate this recipe. Try again.");
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
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={handleClose}
    >
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
          <Pressable
            onPress={handleClose}
            disabled={Boolean(loadingLanguage)}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <Text className="text-base font-bold" style={{ color: colors.text }}>
            Translate recipe
          </Text>
          <View className="h-10 w-10" />
        </View>

        <Text className="mb-3 px-5 text-sm leading-5" style={{ color: colors.textSecondary }}>
          Recipes stay in their original language until you pick one below.
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
              <View className="flex-1 pr-3">
                <Text className="text-base font-semibold" style={{ color: colors.text }}>
                  Original language
                </Text>
                <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                  Show the recipe as extracted
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
                <View className="flex-1 pr-3">
                  <Text className="text-base font-semibold" style={{ color: colors.text }}>
                    {lang.nativeLabel}
                  </Text>
                  <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
                    {getRecipeLanguageLabel(lang.code)}
                  </Text>
                </View>
                {loading ? (
                  <ActivityIndicator color={colors.primary} />
                ) : selected ? (
                  <Ionicons name="checkmark-circle" size={22} color={colors.primary} />
                ) : (
                  <Ionicons name="chevron-forward" size={18} color={colors.textSecondary} />
                )}
              </Pressable>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
