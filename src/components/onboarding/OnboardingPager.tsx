import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useEffect, useState } from 'react';
import { I18nManager, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { AvoidListEditor } from '@/components/AvoidListEditor';
import { LanguagePicker } from '@/components/LanguagePicker';
import { MeasurementToggle } from '@/components/MeasurementToggle';
import { UnitSystemToggle } from '@/components/UnitSystemToggle';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingVision } from '@/components/onboarding/OnboardingVision';
import { ThemePackPicker } from '@/components/ThemePackPicker';
import { ThemeToggle } from '@/components/ThemeToggle';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, MIN_TOUCH, Radii } from '@/components/ui/tokens';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { announce } from '@/lib/a11y';
import { captureHeardAbout, HEARD_ABOUT_SOURCES, type HeardAboutSource } from '@/lib/analytics';
import { avoidListIsEmpty } from '@shared/lib/avoidList';
import type { KitchenDietKey } from '@/lib/kitchenProfile';
import { ONBOARDING_STEP_KEY, parseOnboardingStep } from '@/lib/onboardingStorage';
import { promptRtlReloadIfLayoutMismatch } from '@/lib/rtlLayout';
import { RECIPE_VARIANTS, type RecipeVariantKey } from '@shared/lib/recipeVariants';

/**
 * Vision, then language, look, measurements, an optional diet, an optional avoid list, and how
 * they heard about Pinch.
 */
const QUESTION_STEP_COUNT = 6;
export const ONBOARDING_STEP_COUNT = QUESTION_STEP_COUNT + 1;
const MAX_DIETS = 4;

type OnboardingPagerProps = {
  onAccount: () => void;
  /** "Already have an account?" on the first screen: sign in without answering the questions. */
  onSignIn: () => void;
};

/** A question's heading (h1) and the line under it. */
function StepHeading({ title, subtitle }: { title: string; subtitle: string }) {
  return (
    <View style={{ paddingTop: 12, marginBottom: 20, gap: 8 }}>
      <Text variant="h1">{title}</Text>
      <Text tone="muted">{subtitle}</Text>
    </View>
  );
}

/** A diet as a pill that ticks on and off, read out as a checkbox. The kit's Chip look, with a tick when on. */
function DietChip({
  label,
  checked,
  disabled,
  trackId,
  onPress,
}: {
  label: string;
  checked: boolean;
  disabled: boolean;
  trackId: string;
  onPress: () => void;
}) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const fg = checked ? colors.onPrimary : colors.text;
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: MIN_TOUCH,
        paddingHorizontal: 16,
        borderRadius: Radii.pill,
        borderWidth: HAIRLINE,
        borderColor: checked ? colors.primary : colors.border,
        backgroundColor: checked ? colors.primary : pressed ? colors.backgroundElement : colors.surface,
        opacity: disabled ? 0.45 : 1,
      })}
    >
      {checked ? (
        <View accessible={false} importantForAccessibility="no-hide-descendants">
          <Ionicons name="checkmark" size={16} color={fg} />
        </View>
      ) : null}
      <Text color={fg} style={{ ...type.font('body', 'semibold'), fontSize: 15, lineHeight: 20 }}>
        {label}
      </Text>
    </Pressable>
  );
}

/** First-run preferences. Each answer is saved as they tap, and they can change it in Settings. */
export function OnboardingPager({ onAccount, onSignIn }: OnboardingPagerProps) {
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
  const isAvoid = step === 5;
  const isHeard = step === 6;
  // Fixed step names for the admin Activity log ids.
  const stepName =
    (['vision', 'language', 'look', 'measure', 'cook', 'avoid', 'heard'] as const)[step] ?? 'step';

  const stepTitleKeys = [
    null,
    'onboarding.welcomeSubtitle',
    'onboarding.lookTitle',
    'onboarding.measureTitle',
    'onboarding.cookTitle',
    'avoid.stepTitle',
    'onboarding.heardTitle',
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

  async function saveDiets(nextDiets: KitchenDietKey[]) {
    // Auto-apply stays as it is: off until they turn it on in the avoid step or in Settings.
    await persist({ ...profile, diets: nextDiets });
  }

  /** "Skip" in the header: keep what they picked so far and go straight to the account. */
  async function skipToAccount() {
    await saveDiets(diets);
    onAccount();
  }

  async function finishCook(nextDiets: KitchenDietKey[]) {
    await saveDiets(nextDiets);
    goTo(step + 1);
  }

  /** One tap answers and moves on; skipping sends nothing. */
  function answerHeard(source: HeardAboutSource | null) {
    if (source) captureHeardAbout({ source, platform: Platform.OS });
    onAccount();
  }

  const dietsFull = diets.length >= MAX_DIETS;
  // The header sits in the native layout direction, which flips only after the RTL reload: point the back chevron
  // by that, not by the app language.
  const backIcon = I18nManager.isRTL ? 'chevron-forward' : 'chevron-back';

  if (!stepLoaded) return <View style={{ flex: 1 }} />;

  return (
    <View style={{ flex: 1 }}>
      {isVision ? null : (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
          <View style={{ flex: 1, minWidth: 72, alignItems: 'flex-start' }}>
            <IconButton
              icon={backIcon}
              directional={false}
              label={t('common.back')}
              trackId={`onboarding.${stepName}.back`}
              onPress={() => goTo(step - 1)}
              style={{ marginStart: -10 }}
            />
          </View>
          <OnboardingProgress count={QUESTION_STEP_COUNT} index={step - 1} />
          <View style={{ flex: 1, minWidth: 72, alignItems: 'flex-end' }}>
            {/* On the diet and avoid steps, the main button is the skip; the last step has its own. */}
            {isCook || isAvoid || isHeard ? null : (
              <Button
                variant="ghost"
                size="sm"
                trackId={`onboarding.${stepName}.skip`}
                onPress={() => void skipToAccount()}
                accessibilityLabel={t('onboarding.skip')}
                style={{ marginEnd: -8 }}
              >
                {t('onboarding.skip')}
              </Button>
            )}
          </View>
        </View>
      )}

      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        automaticallyAdjustKeyboardInsets
      >
        {isVision ? <OnboardingVision /> : null}

        {isLanguage ? (
          <>
            <StepHeading title={t('onboarding.welcomeSubtitle')} subtitle={t('onboarding.languageLabel')} />
            <LanguagePicker skipRtlPrompt trackId="onboarding.language" />
          </>
        ) : null}

        {isLook ? (
          <>
            <StepHeading title={t('onboarding.lookTitle')} subtitle={t('onboarding.lookSubtitle')} />
            <ThemeToggle trackId="onboarding.theme" />
            <View style={{ marginTop: 16 }}>
              <ThemePackPicker trackId="onboarding.theme_pack" />
            </View>
          </>
        ) : null}

        {isMeasure ? (
          <>
            <StepHeading title={t('onboarding.measureTitle')} subtitle={t('onboarding.measureSubtitle')} />
            <MeasurementToggle trackId="onboarding.measurement" hint />
            <TileLabel style={{ marginTop: 28, marginBottom: 10 }}>{t('measurement.unitsTitle')}</TileLabel>
            <UnitSystemToggle trackId="onboarding.units" />
            <Text variant="caption" tone="muted" style={{ marginTop: 8 }}>
              {t('measurement.unitsHint')}
            </Text>
          </>
        ) : null}

        {isCook ? (
          <>
            <StepHeading title={t('onboarding.cookTitle')} subtitle={t('onboarding.cookSubtitle')} />
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {RECIPE_VARIANTS.map((variant) => {
                const active = diets.includes(variant.key as KitchenDietKey);
                return (
                  <DietChip
                    key={variant.key}
                    trackId={`onboarding.cook.diet.${variant.key}`}
                    label={t(`recipe.variants.${variant.key}.label`)}
                    checked={active}
                    disabled={dietsFull && !active}
                    onPress={() => toggleDiet(variant.key)}
                  />
                );
              })}
            </View>
            {dietsFull ? (
              <Text variant="caption" tone="muted" style={{ marginTop: 12 }}>
                {t('onboarding.dietLimit', { count: MAX_DIETS })}
              </Text>
            ) : null}
          </>
        ) : null}

        {isAvoid ? (
          <>
            <StepHeading title={t('avoid.stepTitle')} subtitle={t('avoid.stepSubtitle')} />
            <AvoidListEditor
              profile={profile}
              onChange={(next) => void persist(next)}
              trackPrefix="onboarding.avoid"
            />
            {/* The same switch as Settings → Recipe, offered once there is something to apply. */}
            {profile.diets.length > 0 || !avoidListIsEmpty(profile) ? (
              <Tile
                size="md"
                trackId="onboarding.avoid.auto_apply.toggle"
                onPress={() => void persist({ ...profile, autoApplyOnExtract: !profile.autoApplyOnExtract })}
                accessibilityRole="switch"
                accessibilityState={{ checked: profile.autoApplyOnExtract }}
                accessibilityLabel={t('avoid.autoApplyTitle')}
                accessibilityHint={t('avoid.autoApplyHint')}
                style={{
                  marginTop: 24,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  paddingHorizontal: 18,
                  paddingVertical: 16,
                }}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                  <Text weight="semibold">{t('avoid.autoApplyTitle')}</Text>
                  <Text variant="caption" tone="muted">
                    {t('avoid.autoApplyHint')}
                  </Text>
                </View>
                <View
                  accessible={false}
                  importantForAccessibility="no-hide-descendants"
                  style={{
                    width: 46,
                    height: 28,
                    borderRadius: 14,
                    padding: 3,
                    backgroundColor: profile.autoApplyOnExtract ? colors.primary : colors.backgroundSelected,
                  }}
                >
                  <View
                    style={{
                      width: 22,
                      height: 22,
                      borderRadius: 11,
                      backgroundColor: profile.autoApplyOnExtract ? colors.onPrimary : colors.surface,
                      alignSelf: profile.autoApplyOnExtract ? 'flex-end' : 'flex-start',
                    }}
                  />
                </View>
              </Tile>
            ) : null}
          </>
        ) : null}

        {isHeard ? (
          <>
            <StepHeading title={t('onboarding.heardTitle')} subtitle={t('onboarding.heardSubtitle')} />
            <View style={{ gap: 8 }}>
              {HEARD_ABOUT_SOURCES.map((source) => (
                <Tile
                  key={source}
                  size="sm"
                  trackId={`onboarding.heard.${source}`}
                  onPress={() => answerHeard(source)}
                  accessibilityRole="button"
                  style={{
                    minHeight: 56,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    gap: 12,
                    paddingHorizontal: 18,
                    paddingVertical: 14,
                  }}
                >
                  <Text weight="semibold" style={{ flex: 1 }}>
                    {t(`onboarding.heardSources.${source}`)}
                  </Text>
                  <View accessible={false} importantForAccessibility="no-hide-descendants">
                    <Ionicons
                      name={I18nManager.isRTL ? 'chevron-back' : 'chevron-forward'}
                      size={18}
                      color={colors.textSecondary}
                    />
                  </View>
                </Tile>
              ))}
            </View>
          </>
        ) : null}

        {!isVision && !isLanguage && !isHeard ? (
          <Text variant="caption" tone="muted" style={{ marginTop: 20 }}>
            {t('onboarding.changeLater')}
          </Text>
        ) : null}
      </ScrollView>

      <View style={{ gap: 4, paddingTop: 16 }}>
        {isHeard ? (
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            trackId="onboarding.heard.skip"
            onPress={() => answerHeard(null)}
          >
            {t('onboarding.skip')}
          </Button>
        ) : isCook && diets.length === 0 ? (
          <Button size="lg" fullWidth trackId="onboarding.cook.everything" onPress={() => void finishCook([])}>
            {t('onboarding.cookEverything')}
          </Button>
        ) : (
          <Button
            size="lg"
            fullWidth
            trackId={isCook ? 'onboarding.cook.finish' : `onboarding.${stepName}.next`}
            onPress={() => {
              if (isCook) void finishCook(diets);
              else goNext();
            }}
          >
            {isVision
              ? t('onboarding.visionCta')
              : isAvoid && avoidListIsEmpty(profile)
                ? t('avoid.nothing')
                : isCook || isAvoid
                  ? t('onboarding.continue')
                  : t('onboarding.next')}
          </Button>
        )}
        {isVision ? (
          <Button variant="ghost" size="lg" fullWidth trackId="onboarding.vision.sign_in" onPress={onSignIn}>
            {t('auth.haveAccount')}
          </Button>
        ) : null}
        {isCook && diets.length > 0 ? (
          <Button
            variant="ghost"
            size="lg"
            fullWidth
            trackId="onboarding.cook.everything_instead"
            onPress={() => void finishCook([])}
          >
            {t('onboarding.cookEverything')}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
