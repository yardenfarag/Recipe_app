import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LanguagePicker } from '@/components/LanguagePicker';
import { MeasurementToggle } from '@/components/MeasurementToggle';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingVision } from '@/components/onboarding/OnboardingVision';
import { ThemePackPicker } from '@/components/ThemePackPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useThemePreference } from '@/hooks/useThemePreference';
import type { KitchenDietKey } from '@/lib/kitchenProfile';
import { RECIPE_VARIANTS, type RecipeVariantKey } from '@/lib/recipeVariants';

/** Vision, then language, look, measurements, and an optional diet. */
const QUESTION_STEP_COUNT = 4;
export const ONBOARDING_STEP_COUNT = QUESTION_STEP_COUNT + 1;

type OnboardingPagerProps = {
  onAccount: () => void;
};

/** First-run preferences. Each answer is saved as they tap, and they can change it in Settings. */
export function OnboardingPager({ onAccount }: OnboardingPagerProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { profile, persist } = useKitchenProfile();
  const [step, setStep] = useState(0);
  const [diets, setDiets] = useState<KitchenDietKey[]>(profile.diets);

  const isVision = step === 0;
  const isLanguage = step === 1;
  const isLook = step === 2;
  const isMeasure = step === 3;
  const isCook = step === 4;

  function goNext() {
    setStep((current) => Math.min(current + 1, ONBOARDING_STEP_COUNT - 1));
  }

  function toggleDiet(key: RecipeVariantKey) {
    if (key === 'custom') return;
    setDiets((current) => {
      const diet = key as KitchenDietKey;
      if (current.includes(diet)) return current.filter((item) => item !== diet);
      return [...current, diet].slice(0, 4);
    });
  }

  async function finishCook(nextDiets: KitchenDietKey[]) {
    await persist({ ...profile, diets: nextDiets, autoApplyOnExtract: false });
    onAccount();
  }

  return (
    <View className="flex-1">
      {isVision ? null : (
      <View className="mb-1 flex-row items-center justify-between px-1">
        <View className="min-h-[28px] min-w-[64px] flex-1">
          {isCook ? (
            <Pressable
              onPress={() => void finishCook([])}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skip')}
              className="self-start py-1 active:opacity-70"
              hitSlop={8}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                {t('onboarding.skip')}
              </Text>
            </Pressable>
          ) : null}
        </View>
        <OnboardingProgress count={QUESTION_STEP_COUNT} index={step - 1} />
        <View className="min-w-[64px] flex-1" />
      </View>
      )}

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        {isVision ? <OnboardingVision /> : null}

        {isLanguage ? (
          <>
            <Text className="mb-1 pt-3 text-2xl font-bold" style={{ color: colors.text }}>
              {t('onboarding.welcomeSubtitle')}
            </Text>
            <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
              {t('onboarding.languageLabel')}
            </Text>
            <LanguagePicker skipRtlPrompt />
          </>
        ) : null}

        {isLook ? (
          <>
            <Text className="mb-1 pt-3 text-2xl font-bold" style={{ color: colors.text }}>
              {t('onboarding.lookTitle')}
            </Text>
            <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
              {t('onboarding.lookSubtitle')}
            </Text>
            <ThemeToggle />
            <View className="mt-4">
              <ThemePackPicker />
            </View>
          </>
        ) : null}

        {isMeasure ? (
          <>
            <Text className="mb-1 pt-3 text-2xl font-bold" style={{ color: colors.text }}>
              {t('onboarding.measureTitle')}
            </Text>
            <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
              {t('onboarding.measureSubtitle')}
            </Text>
            <MeasurementToggle hint />
          </>
        ) : null}

        {isCook ? (
          <>
            <Text className="mb-1 pt-3 text-2xl font-bold" style={{ color: colors.text }}>
              {t('onboarding.cookTitle')}
            </Text>
            <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
              {t('onboarding.cookSubtitle')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {RECIPE_VARIANTS.map((variant) => {
                const active = diets.includes(variant.key as KitchenDietKey);
                return (
                  <Pressable
                    key={variant.key}
                    onPress={() => toggleDiet(variant.key)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
                    style={{ backgroundColor: active ? colors.primary : colors.frosted }}
                  >
                    <Text className="text-sm font-semibold" style={{ color: active ? '#fff' : colors.text }}>
                      {t(`recipe.variants.${variant.key}.label`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </>
        ) : null}

        {!isVision && !isLanguage ? (
          <Text className="mt-4 text-xs leading-5" style={{ color: colors.textSecondary }}>
            {t('onboarding.changeLater')}
          </Text>
        ) : null}
      </ScrollView>

      <View className="gap-3 pt-4">
        {isCook && diets.length === 0 ? (
          <Pressable
            onPress={() => void finishCook([])}
            accessibilityRole="button"
            className="items-center rounded-[18px] px-4 py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-[15px] font-bold text-white">{t('onboarding.cookEverything')}</Text>
          </Pressable>
        ) : (
          <Pressable
            onPress={() => {
              if (isCook) void finishCook(diets);
              else goNext();
            }}
            accessibilityRole="button"
            className="items-center rounded-[18px] px-4 py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-[15px] font-bold text-white">
              {isVision
                ? t('onboarding.visionCta')
                : isCook || isLanguage
                  ? t('onboarding.continue')
                  : t('onboarding.next')}
            </Text>
          </Pressable>
        )}
        {isCook && diets.length > 0 ? (
          <Pressable
            onPress={() => void finishCook([])}
            accessibilityRole="button"
            className="items-center py-2 active:opacity-70"
          >
            <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
              {t('onboarding.cookEverything')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
