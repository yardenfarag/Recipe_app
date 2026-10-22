import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  I18nManager,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ShareIllustration } from '@/components/onboarding/illustrations/ShareIllustration';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
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
/** Largest spotlight circle around a tab (icon + label). */
const SPOTLIGHT_MAX = 64;
const RING_GAP = 3;

/**
 * Coach marks over the tab bar after first-run onboarding: Snap, sharing from
 * TikTok or Instagram, then the Library. Skippable from every step.
 *
 * Rendered as an in-tree overlay, not a native `Modal`: it mounts right as the
 * auth modal dismisses, and iOS can't present a second modal mid-dismissal —
 * the walkthrough never showed but its window still swallowed every touch, so
 * new users were stuck until they relaunched the app.
 */
export function FirstRunWalkthrough({
  tabBarHeight,
  tabBarPaddingBottom,
  onFinish,
}: FirstRunWalkthroughProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { width, height, fontScale } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const reduceMotion = useReducedMotion();
  const [step, setStep] = useState<WalkthroughStep>('snap');

  // Android back skips the tour, as the Modal's onRequestClose used to.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onFinish();
      return true;
    });
    return () => sub.remove();
  }, [onFinish]);

  const stepIndex = WALKTHROUGH_STEPS.indexOf(step);
  const isLast = nextWalkthroughStep(step) === null;
  const target = step === 'share' ? null : tabItemFrame(step, width, I18nManager.isRTL);
  // Keep the card on screen at large text sizes: the copy scrolls, the buttons stay put.
  const cardMaxHeight = target
    ? height - insets.top - 16 - tabBarHeight - TOOLTIP_GAP
    : height - insets.top - insets.bottom - 32;
  // The share illustration is decoration; drop it when big text needs the room.
  const showShareIllustration = fontScale <= 1.3;

  function goNext() {
    const next = nextWalkthroughStep(step);
    if (next) {
      setStep(next);
      announce(
        `${t('a11y.stepOf', {
          current: WALKTHROUGH_STEPS.indexOf(next) + 1,
          total: WALKTHROUGH_STEPS.length,
        })}. ${t(`walkthrough.${next}Title`)}. ${t(`walkthrough.${next}Body`)}`,
      );
    } else onFinish();
  }

  const card = (
    <View
      accessibilityViewIsModal
      onAccessibilityEscape={onFinish}
      className="rounded-3xl px-5 pb-4 pt-5"
      style={{
        maxHeight: cardMaxHeight,
        backgroundColor: colors.surface,
        borderWidth: 1,
        borderColor: colors.frostedBorder,
      }}
    >
      <ScrollView style={{ flexGrow: 0 }} bounces={false}>
        <Text
          className="mb-1 text-xs font-semibold"
          style={{ color: colors.primary }}
          accessibilityLabel={t('a11y.stepOf', {
            current: stepIndex + 1,
            total: WALKTHROUGH_STEPS.length,
          })}
        >
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
      </ScrollView>

      <View className="mt-4 flex-row items-center justify-between">
        {isLast ? (
          <View />
        ) : (
          <Pressable
            onPress={onFinish}
            accessibilityRole="button"
            accessibilityLabel={t('walkthrough.skip')}
            className="min-h-[44px] justify-center py-2 active:opacity-70"
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
          <Text className="text-sm font-semibold" style={{ color: colors.onPrimary }}>
            {isLast ? t('walkthrough.done') : t('walkthrough.next')}
          </Text>
        </Pressable>
      </View>
    </View>
  );

  // Circle centred on the tab's icon + label (the bar has 6pt top padding).
  const spotlight = target ? Math.min(target.width - 6, SPOTLIGHT_MAX) : 0;
  const centerX = target ? target.left + target.width / 2 : 0;
  const centerFromBottom = tabBarPaddingBottom + (tabBarHeight - tabBarPaddingBottom - 6) / 2;
  // A thick round border dims everything except a clean circular hole.
  const dimBorder = width + height;

  return (
    <Animated.View
      entering={reduceMotion ? undefined : FadeIn.duration(220)}
      exiting={reduceMotion ? undefined : FadeOut.duration(160)}
      style={[StyleSheet.absoluteFill, { zIndex: 1000, elevation: 1000 }]}
      // Swallow touches so the app underneath can't be used mid-tour.
      onStartShouldSetResponder={() => true}
    >
      {target ? (
        // Tab frames are physical (already mirrored for RTL), so lay out LTR here.
        <View style={{ flex: 1, direction: 'ltr', overflow: 'hidden' }}>
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              left: centerX - spotlight / 2 - dimBorder,
              bottom: centerFromBottom - spotlight / 2 - dimBorder,
              width: spotlight + dimBorder * 2,
              height: spotlight + dimBorder * 2,
              borderRadius: spotlight / 2 + dimBorder,
              borderWidth: dimBorder,
              borderColor: colors.overlay,
            }}
          />
          <View
            pointerEvents="none"
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              position: 'absolute',
              left: centerX - spotlight / 2 - RING_GAP,
              bottom: centerFromBottom - spotlight / 2 - RING_GAP,
              width: spotlight + RING_GAP * 2,
              height: spotlight + RING_GAP * 2,
              borderRadius: spotlight / 2 + RING_GAP,
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
                  centerX - 16 - ARROW_SIZE / 2,
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
          {showShareIllustration ? (
            <View
              className="mb-4 items-center"
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <ShareIllustration />
            </View>
          ) : null}
          {card}
        </View>
      )}
    </Animated.View>
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
            accessible={false}
            importantForAccessibility="no-hide-descendants"
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
