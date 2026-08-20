import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';

import { SheetModal } from '@/components/SheetModal';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { resolveCulinaryLanguage } from '@/lib/culinaryUnits';
import { displayIngredientAmount } from '@/lib/displayIngredientAmount';
import {
  mergeRewrittenInstructions,
  patchInstructionsForSubstitution,
} from '@/lib/patchInstructionsForSubstitution';
import { RecipeLanguageCode } from '@/lib/recipeLanguages';
import {
  SubstitutionAlternative,
  rewriteInstructionsForSubstitution,
  suggestSubstitution,
} from '@/lib/supabase/suggestSubstitution';
import { Ingredient, Instruction } from '@/types/recipe';

interface SubstitutionModalProps {
  visible: boolean;
  ingredient: Ingredient | null;
  recipeTitle: string;
  otherIngredients: string[];
  instructions: Instruction[];
  /** Active translation language — biases swaps to that locale's supermarket. */
  language?: RecipeLanguageCode | null;
  onClose: () => void;
  onApply: (alternative: SubstitutionAlternative, instructions: Instruction[]) => void;
}

/**
 * Shown when the user taps "Swap" on an ingredient. Fetches AI alternatives
 * and lets the user apply one (caller writes ingredients + instructions back).
 */
export function SubstitutionModal({
  visible,
  ingredient,
  recipeTitle,
  otherIngredients,
  instructions,
  language = null,
  onClose,
  onApply,
}: SubstitutionModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { language: appLanguage } = useLanguagePreference();
  const { system: measurementSystem } = useMeasurementPreference();
  const unitLanguage = resolveCulinaryLanguage(language, appLanguage);
  const [loading, setLoading] = useState(false);
  const [applyingName, setApplyingName] = useState<string | null>(null);
  const [alternatives, setAlternatives] = useState<SubstitutionAlternative[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !ingredient) return;

    let isMounted = true;
    setLoading(true);
    setError(null);
    setAlternatives([]);
    setApplyingName(null);

    suggestSubstitution(ingredient, recipeTitle, otherIngredients, language)
      .then((result) => {
        if (!isMounted) return;
        if (result.status === 'failed' || !result.alternatives) {
          setError(result.message ?? t('recipe.swapFailed'));
          return;
        }
        setAlternatives(result.alternatives);
      })
      .catch(() => {
        if (!isMounted) return;
        setError(t('recipe.swapFailed'));
      })
      .finally(() => {
        if (isMounted) setLoading(false);
      });

    return () => {
      isMounted = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible, ingredient?.name, language]);

  async function handleApply(alt: SubstitutionAlternative) {
    if (!ingredient || applyingName) return;
    setApplyingName(alt.name);
    setError(null);

    let nextInstructions = patchInstructionsForSubstitution(
      instructions,
      ingredient.name,
      alt.name,
    );

    try {
      const result = await rewriteInstructionsForSubstitution(
        ingredient,
        alt,
        instructions,
        recipeTitle,
        language,
      );
      if (result.status === 'ok' && result.instructions?.length) {
        nextInstructions = mergeRewrittenInstructions(instructions, result.instructions);
      }
    } catch {
      // Local name patch already prepared above.
    }

    onApply(alt, nextInstructions);
    setApplyingName(null);
  }

  return (
    <SheetModal visible={visible} onClose={onClose} title={t('recipe.swapTitle')} maxWidth={480}>
      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        {ingredient && (
          <View
            className="mb-5 rounded-3xl border p-4"
            style={{ borderColor: colors.border, backgroundColor: colors.background }}
          >
            <Text className="mb-1 text-xs font-medium" style={{ color: colors.textSecondary }}>
              {t('recipe.swapInsteadOf')}
            </Text>
            <Text className="text-lg font-bold" style={{ color: colors.text }}>
              {displayIngredientAmount(ingredient, {
                system: measurementSystem,
                language: unitLanguage,
              })}{' '}
              {ingredient.name}
            </Text>
          </View>
        )}

        {loading && (
          <View className="items-center py-12">
            <ActivityIndicator color={colors.primary} size="large" />
            <Text className="mt-3 text-sm" style={{ color: colors.textSecondary }}>
              {t('recipe.swapFinding')}
            </Text>
          </View>
        )}

        {!loading && error && (
          <View
            className="rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
          >
            <Text className="text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          </View>
        )}

        {!loading &&
          alternatives.map((alt) => {
            const isApplying = applyingName === alt.name;
            const disabled = applyingName != null;
            return (
              <View
                key={alt.name}
                className="mb-3 rounded-3xl border p-4"
                style={{ borderColor: colors.border, backgroundColor: colors.background }}
              >
                <Text className="mb-1 text-base font-bold" style={{ color: colors.text }}>
                  {displayIngredientAmount(alt, {
                    system: measurementSystem,
                    language: unitLanguage,
                  })}{' '}
                  {alt.name}
                </Text>
                <Text className="mb-3 text-sm leading-5" style={{ color: colors.textSecondary }}>
                  {alt.reason}
                </Text>
                <Pressable
                  className="items-center rounded-full py-3 active:opacity-80"
                  style={{
                    backgroundColor: colors.primary,
                    opacity: disabled && !isApplying ? 0.5 : 1,
                  }}
                  disabled={disabled}
                  onPress={() => void handleApply(alt)}
                >
                  {isApplying ? (
                    <View className="flex-row items-center gap-2">
                      <ActivityIndicator color="#fff" size="small" />
                      <Text className="text-sm font-bold text-white">
                        {t('recipe.swapUpdatingSteps')}
                      </Text>
                    </View>
                  ) : (
                    <Text className="text-sm font-bold text-white">{t('recipe.swapUseThis')}</Text>
                  )}
                </Pressable>
              </View>
            );
          })}
        <View className="h-4" />
      </ScrollView>
    </SheetModal>
  );
}
