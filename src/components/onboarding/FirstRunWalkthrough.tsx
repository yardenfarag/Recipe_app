import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  BackHandler,
  I18nManager,
  Platform,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, { FadeIn, FadeOut, useReducedMotion } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';

import { ShareIllustration } from '@/components/onboarding/illustrations/ShareIllustration';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { TileLabel, useTileStyle } from '@/components/ui/Tile';
import { HAIRLINE } from '@/components/ui/tokens';
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
  const tileStyle = useTileStyle('surface', 'lg');

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
      style={[tileStyle, { maxHeight: cardMaxHeight, paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }]}
    >
      <ScrollView style={{ flexGrow: 0 }} bounces={false}>
        <TileLabel
          tone="primary"
          accessibilityLabel={t('a11y.stepOf', {
            current: stepIndex + 1,
            total: WALKTHROUGH_STEPS.length,
          })}
        >
          {t('walkthrough.progress', { current: stepIndex + 1, total: WALKTHROUGH_STEPS.length })}
        </TileLabel>
        <Text variant="h2" style={{ marginTop: 6, marginBottom: 6 }}>
          {t(`walkthrough.${step}Title`)}
        </Text>
        <Text variant="bodySmall" tone="muted">
          {t(`walkthrough.${step}Body`)}
        </Text>

        {step === 'share' ? <ShareSteps /> : null}
      </ScrollView>

      <View style={{ marginTop: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
        {isLast ? (
          <View />
        ) : (
          <Button
            variant="ghost"
            trackId="walkthrough.skip"
            onPress={onFinish}
            accessibilityLabel={t('walkthrough.skip')}
            style={{ marginStart: -8 }}
          >
            {t('walkthrough.skip')}
          </Button>
        )}
        <Button trackId="walkthrough.next" onPress={goNext}>
          {isLast ? t('walkthrough.done') : t('walkthrough.next')}
        </Button>
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
                // Kept clear of the tile's 28 corners.
                left: clamp(
                  centerX - 16 - ARROW_SIZE / 2,
                  22,
                  width - 32 - 22 - ARROW_SIZE,
                ),
                width: ARROW_SIZE,
                height: ARROW_SIZE,
                backgroundColor: colors.surface,
                borderRightWidth: HAIRLINE,
                borderBottomWidth: HAIRLINE,
                borderColor: colors.border,
                transform: [{ rotate: '45deg' }],
              }}
            />
          </View>
        </View>
      ) : (
        <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 20, backgroundColor: colors.overlay }}>
          {showShareIllustration ? (
            <View
              style={{ marginBottom: 16, alignItems: 'center' }}
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
    <View style={{ marginTop: 14, gap: 8 }}>
      {options.map((option) => (
        <View
          key={option.title}
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 12,
            padding: 14,
            borderRadius: 16,
            backgroundColor: colors.backgroundElement,
          }}
        >
          <View
            style={{
              width: 36,
              height: 36,
              borderRadius: 12,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primarySoft,
            }}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name={option.icon} size={18} color={colors.primaryText} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text variant="bodySmall" weight="semibold">
              {option.title}
            </Text>
            <Text variant="bodySmall" tone="muted">
              {option.body}
            </Text>
            {option.hint ? (
              <Text variant="caption" tone="muted" style={{ marginTop: 2 }}>
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
