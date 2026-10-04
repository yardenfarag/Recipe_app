import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { I18nManager, Modal, Platform, Pressable, Text, View, useWindowDimensions } from 'react-native';
import { useTranslation } from 'react-i18next';

import { ShareIllustration } from '@/components/onboarding/illustrations/ShareIllustration';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  nextWalkthroughStep,
  tabItemFrame,
  WALKTHROUGH_STEPS,
  type WalkthroughStep,
} from '@/lib/walkthroughStorage';

type FirstRunWalkthroughProps = {
  /** Full height of the bottom tab bar, including its bottom inset padding. */
  tabBarHeight: number;
  /** Bottom padding inside the tab bar (safe area), so the ring hugs the icons. */
  tabBarPaddingBottom: number;
  onFinish: () => void;
};

const TOOLTIP_GAP = 14;
const ARROW_SIZE = 14;

/**
 * Coach marks over the tab bar after first-run onboarding: Snap, sharing from
 * TikTok or Instagram, then the Library. Skippable from every step.
 */
export function FirstRunWalkthrough({
  tabBarHeight,
  tabBarPaddingBottom,
  onFinish,
}: FirstRunWalkthroughProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { width } = useWindowDimensions();
  const [step, setStep] = useState<WalkthroughStep>('snap');

  const stepIndex = WALKTHROUGH_STEPS.indexOf(step);
  const isLast = nextWalkthroughStep(step) === null;
  const target = step === 'share' ? null : tabItemFrame(step, width, I18nManager.isRTL);

  function goNext() {
    const next = nextWalkthroughStep(step);
    if (next) setStep(next);
    else onFinish();
  }

  const card = (
    <View
      accessibilityViewIsModal
      className="rounded-3xl px-5 pb-4 pt-5"
      style={{
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.frostedBorder,
      }}
    >
      <Text className="mb-1 text-xs font-semibold" style={{ color: colors.primary }}>
        {t('walkthrough.progress', { current: stepIndex + 1, total: WALKTHROUGH_STEPS.length })}
      </Text>
      <Text
        accessibilityRole="header"
        className="mb-1 text-lg font-bold"
        style={{ color: colors.text }}
      >
        {t(`walkthrough.${step}Title`)}
      </Text>
      <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
        {t(`walkthrough.${step}Body`)}
      </Text>

      {step === 'share' ? <ShareSteps /> : null}

      <View className="mt-4 flex-row items-center justify-between">
        {isLast ? (
          <View />
        ) : (
          <Pressable
            onPress={onFinish}
            accessibilityRole="button"
            accessibilityLabel={t('walkthrough.skip')}
            className="py-2 active:opacity-70"
            hitSlop={8}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.textSecondary }}>
              {t('walkthrough.skip')}
            </Text>
          </Pressable>
        )}
        <Pressable
          onPress={goNext}
          accessibilityRole="button"
          className="min-h-[44px] items-center justify-center rounded-2xl px-5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-sm font-semibold" style={{ color: '#fff' }}>
            {isLast ? t('walkthrough.done') : t('walkthrough.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  return (
    <Modal
      transparent
      visible
      animationType="fade"
      statusBarTranslucent
      navigationBarTranslucent
      onRequestClose={onFinish}
    >
      {target ? (
        // Tab frames are physical (already mirrored for RTL), so lay out LTR here.
        <View style={{ flex: 1, direction: 'ltr' }}>
          <View style={{ flex: 1, backgroundColor: colors.overlay }} />
          {/* Dim the tab bar around the highlighted tab, leaving it bright. */}
          <View style={{ height: tabBarHeight, flexDirection: 'row' }}>
            <View style={{ width: target.left, backgroundColor: colors.overlay }} />
            <View style={{ width: target.width }} />
            <View style={{ flex: 1, backgroundColor: colors.overlay }} />
          </View>
          <View
            pointerEvents="none"
            style={{
              position: 'absolute',
              left: target.left + 4,
              width: target.width - 8,
              bottom: tabBarPaddingBottom - 2,
              height: tabBarHeight - tabBarPaddingBottom,
              borderRadius: 16,
              borderWidth: 2,
              borderColor: colors.primary,
            }}
          />
          <View
            style={{
              position: 'absolute',
              left: 16,
              right: 16,
              bottom: tabBarHeight + TOOLTIP_GAP,
            }}
          >
            <View style={{ direction: I18nManager.isRTL ? 'rtl' : 'ltr' }}>{card}</View>
            <View
              style={{
                position: 'absolute',
                bottom: -ARROW_SIZE / 2,
                left: clamp(
                  target.left + target.width / 2 - 16 - ARROW_SIZE / 2,
                  20,
                  width - 32 - 20 - ARROW_SIZE,
                ),
                width: ARROW_SIZE,
                height: ARROW_SIZE,
                backgroundColor: colors.surface,
                borderRightWidth: 1,
                borderBottomWidth: 1,
                borderColor: colors.frostedBorder,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </View>
        </View>
      ) : (
        <View
          className="flex-1 justify-center px-5"
          style={{ backgroundColor: colors.overlay }}
        >
          <View className="mb-4 items-center">
            <ShareIllustration />
          </View>
          {card}
        </View>
      )}
    </Modal>
  );
}

/** The two ways in: share straight to Pinch, or copy the link and paste it on Snap. */
function ShareSteps() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  // Browsers can't receive shares; the direct option still applies to the phone app.
  const directHint =
    Platform.OS === 'web'
      ? t('walkthrough.shareDirectWebHint')
      : Platform.OS === 'ios'
        ? t('walkthrough.shareDirectIosHint')
        : null;
  const options = [
    {
      icon: 'share-outline' as const,
      title: t('walkthrough.shareDirectTitle'),
      body: t('walkthrough.shareDirectBody'),
      hint: directHint,
    },
    {
      icon: 'link-outline' as const,
      title: t('walkthrough.shareCopyTitle'),
      body: t('walkthrough.shareCopyBody'),
      hint: null,
    },
  ];

  return (
    <View className="mt-3 gap-3">
      {options.map((option) => (
        <View key={option.title} className="flex-row items-start gap-3">
          <View
            className="h-8 w-8 items-center justify-center rounded-full"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name={option.icon} size={16} color={colors.primary} />
          </View>
          <View className="flex-1">
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              {option.title}
            </Text>
            <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
              {option.body}
            </Text>
            {option.hint ? (
              <Text className="mt-0.5 text-xs leading-4" style={{ color: colors.textSecondary }}>
                {option.hint}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}
