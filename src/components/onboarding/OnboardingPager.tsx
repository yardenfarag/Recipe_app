import { useState, type ReactNode } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { BrandHeader } from '@/components/BrandHeader';
import { LanguagePicker } from '@/components/LanguagePicker';
import { OnboardingProgress } from '@/components/onboarding/OnboardingProgress';
import { OnboardingSlide } from '@/components/onboarding/OnboardingSlide';
import { CollectionsIllustration } from '@/components/onboarding/illustrations/CollectionsIllustration';
import { CustomizeIllustration } from '@/components/onboarding/illustrations/CustomizeIllustration';
import { ReadyIllustration } from '@/components/onboarding/illustrations/ReadyIllustration';
import { SaveIllustration } from '@/components/onboarding/illustrations/SaveIllustration';
import { ShareIllustration } from '@/components/onboarding/illustrations/ShareIllustration';
import { useThemePreference } from '@/hooks/useThemePreference';

const TEACHING_COUNT = 4;
/** Language + teaching + ready */
export const ONBOARDING_STEP_COUNT = TEACHING_COUNT + 2;

type OnboardingPagerProps = {
  onFinish: (destination: 'snap' | 'library') => void;
  onSkip: () => void;
};

type TeachingSlide = {
  titleKey: string;
  bodyKey: string;
  illustration: ReactNode;
};

/** Full first-run pager: language → teaching beats → ready CTA. */
export function OnboardingPager({ onFinish, onSkip }: OnboardingPagerProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [step, setStep] = useState(0);

  const teachingSlides: TeachingSlide[] = [
    {
      titleKey: 'onboarding.shareTitle',
      bodyKey: 'onboarding.shareBody',
      illustration: <ShareIllustration />,
    },
    {
      titleKey: 'onboarding.saveTitle',
      bodyKey: 'onboarding.saveBody',
      illustration: <SaveIllustration />,
    },
    {
      titleKey: 'onboarding.collectionsTitle',
      bodyKey: 'onboarding.collectionsBody',
      illustration: <CollectionsIllustration />,
    },
    {
      titleKey: 'onboarding.customizeTitle',
      bodyKey: 'onboarding.customizeBody',
      illustration: <CustomizeIllustration />,
    },
  ];

  const isLanguage = step === 0;
  const isReady = step === ONBOARDING_STEP_COUNT - 1;
  const canSkip = step > 0 && !isReady;
  const progressIndex = step;

  function goNext() {
    if (step < ONBOARDING_STEP_COUNT - 1) {
      setStep((s) => s + 1);
    }
  }

  return (
    <View className="flex-1">
      <View className="mb-1 flex-row items-center justify-between px-1">
        <View className="min-h-[28px] min-w-[64px] flex-1">
          {canSkip ? (
            <Pressable
              onPress={onSkip}
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
        <OnboardingProgress count={ONBOARDING_STEP_COUNT} index={progressIndex} />
        <View className="min-w-[64px] flex-1" />
      </View>

      <View className="flex-1">
        {isLanguage ? (
          <ScrollView
            className="flex-1"
            contentContainerStyle={{ flexGrow: 1, paddingBottom: 8 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            <View className="mb-5 pt-3">
              <BrandHeader
                title={t('onboarding.welcomeTitle')}
                subtitle={t('onboarding.welcomeSubtitle')}
                size="hero"
                align="center"
              />
            </View>
            <View className="gap-2">
              <Text className="mb-1 text-sm font-semibold" style={{ color: colors.text }}>
                {t('onboarding.languageLabel')}
              </Text>
              <LanguagePicker skipRtlPrompt />
            </View>
          </ScrollView>
        ) : null}

        {!isLanguage && !isReady
          ? teachingSlides.map((slide, index) => {
              const slideStep = index + 1;
              if (step !== slideStep) return null;
              return (
                <OnboardingSlide
                  key={slide.titleKey}
                  stepKey={slideStep}
                  title={t(slide.titleKey)}
                  body={t(slide.bodyKey)}
                  illustration={slide.illustration}
                />
              );
            })
          : null}

        {isReady ? (
          <OnboardingSlide
            stepKey="ready"
            title={t('onboarding.readyTitle')}
            body={t('onboarding.readyBody')}
            illustration={<ReadyIllustration />}
          />
        ) : null}
      </View>

      <View className="gap-3 pt-4">
        {isReady ? (
          <>
            <Pressable
              onPress={() => onFinish('snap')}
              accessibilityRole="button"
              className="items-center rounded-[18px] px-4 py-3.5 active:opacity-80"
              style={{ backgroundColor: colors.primary }}
            >
              <Text className="text-[15px] font-bold text-white">{t('onboarding.ctaSnap')}</Text>
            </Pressable>
            <Pressable
              onPress={() => onFinish('library')}
              accessibilityRole="button"
              className="items-center py-2 active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
                {t('onboarding.ctaLibrary')}
              </Text>
            </Pressable>
          </>
        ) : (
          <Pressable
            onPress={goNext}
            accessibilityRole="button"
            className="items-center rounded-[18px] px-4 py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-[15px] font-bold text-white">
              {isLanguage ? t('onboarding.continue') : t('onboarding.next')}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}
