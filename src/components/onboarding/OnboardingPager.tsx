import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { I18nManager, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LanguagePicker } from '@/components/LanguagePicker';
import { MeasurementToggle } from '@/components/MeasurementToggle';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingVision } from '@/components/onboarding/OnboardingVision';
import { ThemePackPicker } from '@/components/ThemePackPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import type { KitchenDietKey } from '@/lib/kitchenProfile';
import { ONBOARDING_STEP_KEY, parseOnboardingStep } from '@/lib/onboardingStorage';
import { promptRtlReloadIfLayoutMismatch } from '@/lib/rtlLayout';
import { RECIPE_VARIANTS, type RecipeVariantKey } from '@/lib/recipeVariants';

/** Vision, then language, look, measurements, and an optional diet. */
const QUESTION_STEP_COUNT = 4;
export const ONBOARDING_STEP_COUNT = QUESTION_STEP_COUNT + 1;
const MAX_DIETS = 4;

type OnboardingPagerProps = {
  onAccount: () => void;
};

/** First-run preferences. Each answer is saved as they tap, and they can change it in Settings. */
export function OnboardingPager({ onAccount }: OnboardingPagerProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { profile, persist } = useKitchenProfile();
  const { language } = useLanguagePreference();
  const [step, setStep] = useState(0);
  const [stepLoaded, setStepLoaded] = useState(false);
  const [diets, setDiets] = useState<KitchenDietKey[]>(profile.diets);

  // Resume where they were: switching to Hebrew or Arabic reloads the app.
  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(ONBOARDING_STEP_KEY)
      .then((saved) => {
        if (!cancelled) setStep(parseOnboardingStep(saved, ONBOARDING_STEP_COUNT));
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setStepLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (stepLoaded) void AsyncStorage.setItem(ONBOARDING_STEP_KEY, String(step)).catch(() => {});
  }, [step, stepLoaded]);

  const isVision = step === 0;
  const isLanguage = step === 1;
  const isLook = step === 2;
  const isMeasure = step === 3;
  const isCook = step === 4;

  const stepTitleKeys = [
    null,
    'onboarding.welcomeSubtitle',
    'onboarding.lookTitle',
    'onboarding.measureTitle',
    'onboarding.cookTitle',
  ] as const;

  function goTo(next: number) {
    setStep(next);
    const titleKey = stepTitleKeys[next];
    if (titleKey) {
      announce(
        `${t('a11y.stepOf', { current: next, total: QUESTION_STEP_COUNT })}. ${t(titleKey)}`,
      );
    }
  }

  function goNext() {
    goTo(Math.min(step + 1, ONBOARDING_STEP_COUNT - 1));
    // Flip the layout now, not after three more steps of mirrored screens.
    if (isLanguage) promptRtlReloadIfLayoutMismatch(language);
  }

  function toggleDiet(key: RecipeVariantKey) {
    if (key === 'custom') return;
    setDiets((current) => {
      const diet = key as KitchenDietKey;
      if (current.includes(diet)) return current.filter((item) => item !== diet);
      return [...current, diet].slice(0, MAX_DIETS);
    });
  }

  async function finishCook(nextDiets: KitchenDietKey[]) {
    await persist({ ...profile, diets: nextDiets, autoApplyOnExtract: false });
    onAccount();
  }

  const dietsFull = diets.length >= MAX_DIETS;

  if (!stepLoaded) return <View className="flex-1" />;

  return (
    <View className="flex-1">
      {isVision ? null : (
      <View className="mb-1 flex-row items-center justify-between px-1">
        <View className="min-h-[28px] min-w-[64px] flex-1 items-start">
          <Pressable
            onPress={() => goTo(step - 1)}
            accessibilityRole="button"
            accessibilityLabel={t('common.back')}
            className="py-1 active:opacity-70"
            hitSlop={8}
          >
            <Ionicons
              name={I18nManager.isRTL ? 'chevron-forward' : 'chevron-back'}
              size={22}
              color={colors.textSecondary}
            />
          </Pressable>
        </View>
        <OnboardingProgress count={QUESTION_STEP_COUNT} index={step - 1} />
        <View className="min-h-[28px] min-w-[64px] flex-1 items-end">
          {/* On the diet step, the "no restrictions" button is the skip. */}
          {isCook ? null : (
            <Pressable
              onPress={() => void finishCook(diets)}
              accessibilityRole="button"
              accessibilityLabel={t('onboarding.skip')}
              className="py-1 active:opacity-70"
              hitSlop={8}
            >
              <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                {t('onboarding.skip')}
              </Text>
            </Pressable>
          )}
        </View>
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
            <Text
              className="mb-1 pt-3 text-2xl font-bold"
              style={{ color: colors.text }}
              accessibilityRole="header"
            >
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
            <Text
              className="mb-1 pt-3 text-2xl font-bold"
              style={{ color: colors.text }}
              accessibilityRole="header"
            >
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
            <Text
              className="mb-1 pt-3 text-2xl font-bold"
              style={{ color: colors.text }}
              accessibilityRole="header"
            >
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
            <Text
              className="mb-1 pt-3 text-2xl font-bold"
              style={{ color: colors.text }}
              accessibilityRole="header"
            >
              {t('onboarding.cookTitle')}
            </Text>
            <Text className="mb-4 text-sm leading-5" style={{ color: colors.textSecondary }}>
              {t('onboarding.cookSubtitle')}
            </Text>
            <View className="flex-row flex-wrap gap-2">
              {RECIPE_VARIANTS.map((variant) => {
                const active = diets.includes(variant.key as KitchenDietKey);
                const blocked = dietsFull && !active;
                return (
                  <Pressable
                    key={variant.key}
                    onPress={() => toggleDiet(variant.key)}
                    disabled={blocked}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: active, disabled: blocked }}
                    className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
                    style={{
                      backgroundColor: active ? colors.primary : colors.frosted,
                      opacity: blocked ? 0.45 : 1,
                    }}
                  >
                    <Text className="text-sm font-semibold" style={{ color: active ? colors.onPrimary : colors.text }}>
                      {t(`recipe.variants.${variant.key}.label`)}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {dietsFull ? (
              <Text className="mt-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
                {t('onboarding.dietLimit', { count: MAX_DIETS })}
              </Text>
            ) : null}
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
            <Text className="text-[15px] font-bold" style={{ color: colors.onPrimary }}>
              {t('onboarding.cookEverything')}
            </Text>
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
            <Text className="text-[15px] font-bold" style={{ color: colors.onPrimary }}>
              {isVision
                ? t('onboarding.visionCta')
                : isCook
                  ? t('onboarding.continue')
                  : t('onboarding.next')}
            </Text>
          </Pressable>
        )}
        {isCook && diets.length > 0 ? (
          <Pressable
            onPress={() => void finishCook([])}
            accessibilityRole="button"
            className="min-h-[44px] items-center justify-center py-2 active:opacity-70"
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
