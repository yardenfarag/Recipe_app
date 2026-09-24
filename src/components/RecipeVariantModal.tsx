import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, Pressable, ScrollView, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { TextInput } from '@/components/text-input';
import { useAuth } from '@/hooks/useAuth';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { RECIPE_REMIX_LIMIT } from '@/lib/quotas';
import { RECIPE_VARIANTS, RecipeVariantKey } from '@/lib/recipeVariants';
import { transformRecipe, TransformedRecipePayload } from '@/lib/supabase/transformRecipe';
import { Ingredient, Instruction } from '@/types/recipe';

interface RecipeVariantModalProps {
  visible: boolean;
  title: string;
  servings: number;
  ingredients: Ingredient[];
  instructions: Instruction[];
  calories?: number;
  recipeId?: string;
  originalUrl?: string;
  onClose: () => void;
  onApply: (result: TransformedRecipePayload, variant: RecipeVariantKey) => void;
}

/**
 * Sheet for picking a dietary/lifestyle remix (healthier, vegan, etc.).
 * Calls Gemini and lets the user preview + apply the adapted recipe.
 * Free for signed-in users, with a server-side per-recipe limit.
 */
export function RecipeVariantModal({
  visible,
  title,
  servings,
  ingredients,
  instructions,
  calories,
  recipeId,
  originalUrl,
  onClose,
  onApply,
}: RecipeVariantModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { chevronForward, textAlign } = useRtl();
  const { user } = useAuth();
  const [instruction, setInstruction] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<{
    variant: RecipeVariantKey;
    recipe: TransformedRecipePayload;
  } | null>(null);

  function handleClose() {
    if (loading) return;
    setError(null);
    setPreview(null);
    setInstruction('');
    onClose();
  }

  async function handleCustomRemix() {
    const trimmed = instruction.trim();
    if (!trimmed || loading) return;
    await handleSelectVariant('custom', trimmed);
  }

  async function handleSelectVariant(variant: RecipeVariantKey, customInstruction?: string) {
    if (loading) return;

    if (!user) {
      onClose();
      router.push('/auth?mode=signup');
      return;
    }
    setLoading(true);
    setError(null);
    setPreview(null);

    try {
      const result = await transformRecipe(
        variant,
        {
          title,
          servings,
          ingredients,
          instructions,
          calories,
          id: recipeId,
          original_url: originalUrl,
        },
        customInstruction,
      );

      if (result.status === 'failed' || !result.recipe) {
        if (result.code === 'auth_required') {
          onClose();
          router.push('/auth?mode=signup');
        } else if (result.code === 'recipe_limit' || result.code === 'daily_limit') {
          setError('recipe_limit');
        } else if (result.code === 'instruction_unrelated') {
          setError(t('recipe.remixUnrelated'));
        } else if (result.code === 'metering_error' || result.code === 'recipe_identity_required') {
          setError(t('recipe.remixFailed'));
        } else {
          setError(result.message ?? t('recipe.remixFailed'));
        }
        return;
      }

      setPreview({ variant, recipe: result.recipe });
    } catch {
      setError(t('recipe.remixFailed'));
    } finally {
      setLoading(false);
    }
  }

  function handleApply() {
    if (!preview) return;
    onApply(preview.recipe, preview.variant);
    setPreview(null);
    setError(null);
    onClose();
  }

  return (
    <SheetModal
      visible={visible}
      onClose={handleClose}
      title={t('recipe.remixTitle')}
      maxWidth={520}
    >
      <ScrollView
        className="flex-1 px-5"
        contentContainerStyle={{ paddingBottom: 32 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
        automaticallyAdjustKeyboardInsets
      >
        {!preview && !loading && (
          <>
            <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
              {t('recipe.remixHint', { limit: RECIPE_REMIX_LIMIT })}
            </Text>

            <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
              {t('recipe.remixCustomTitle')}
            </Text>
            <TextInput
              className="mb-3 min-h-[88px] rounded-2xl border px-3.5 py-3 text-base"
              style={{
                color: colors.text,
                borderColor: colors.border,
                backgroundColor: colors.background,
                textAlign,
                textAlignVertical: 'top',
              }}
              placeholder={t('recipe.remixCustomPlaceholder')}
              placeholderTextColor={colors.textSecondary}
              value={instruction}
              onChangeText={(value) => {
                setInstruction(value);
                if (error) setError(null);
              }}
              multiline
              maxLength={400}
            />
            <Pressable
              onPress={() => void handleCustomRemix()}
              disabled={!instruction.trim()}
              className="mb-6 items-center rounded-3xl py-3.5"
              style={{
                backgroundColor: colors.accentSoft,
                opacity: instruction.trim() ? 1 : 0.45,
              }}
            >
              <Text className="text-sm font-bold" style={{ color: colors.accent }}>
                {t('recipe.remixCustomAction')}
              </Text>
            </Pressable>

            {error ? (
              <View
                className="mb-6 rounded-2xl border px-4 py-3"
                style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
              >
                <Text className="text-sm" style={{ color: colors.danger }}>
                  {error === 'recipe_limit'
                    ? t('recipe.remixRecipeLimit', { limit: RECIPE_REMIX_LIMIT })
                    : error}
                </Text>
                {error !== 'recipe_limit' ? (
                  <Pressable onPress={() => setError(null)} className="mt-3 active:opacity-70">
                    <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                      {t('recipe.remixTryAnother')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {RECIPE_VARIANTS.filter((option) => option.key !== 'custom').map((option) => (
              <Pressable
                key={option.key}
                onPress={() => handleSelectVariant(option.key)}
                className="mb-3 flex-row items-center gap-3.5 rounded-3xl border p-4 active:opacity-90"
                style={{ borderColor: colors.border, backgroundColor: colors.surface }}
              >
                <View
                  className="h-11 w-11 items-center justify-center rounded-2xl"
                  style={{ backgroundColor: colors.primarySoft }}
                >
                  <Ionicons
                    name={option.icon as keyof typeof Ionicons.glyphMap}
                    size={22}
                    color={colors.primary}
                  />
                </View>
                <View className="flex-1">
                  <Text className="text-base font-bold" style={{ color: colors.text }}>
                    {t(`recipe.variants.${option.key}.label`)}
                  </Text>
                  <Text className="mt-0.5 text-sm" style={{ color: colors.textSecondary }}>
                    {t(`recipe.variants.${option.key}.description`)}
                  </Text>
                </View>
                <Ionicons name={chevronForward} size={18} color={colors.textSecondary} />
              </Pressable>
            ))}
          </>
        )}

        {loading && (
          <View className="items-center py-16">
            <ActivityIndicator color={colors.primary} size="large" />
            <Text className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
              {t('recipe.remixAdapting')}
            </Text>
          </View>
        )}

        {!loading && preview && (
          <View>
            <View
              className="mb-5 rounded-3xl border p-4"
              style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            >
              <Text className="mb-1 text-xs font-medium" style={{ color: colors.textSecondary }}>
                {t('recipe.remixWhatChanged')}
              </Text>
              <Text className="text-base leading-6" style={{ color: colors.text }}>
                {preview.recipe.summary}
              </Text>
            </View>

            <Pressable
              className="mb-3 items-center rounded-full py-4 active:opacity-80"
              style={{ backgroundColor: colors.primary }}
              onPress={handleApply}
            >
              <Text className="text-base font-bold text-white">{t('recipe.remixUseVersion')}</Text>
            </Pressable>

            <Pressable
              onPress={() => setPreview(null)}
              className="items-center py-2 active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                {t('recipe.remixPickDifferent')}
              </Text>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </SheetModal>
  );
}
