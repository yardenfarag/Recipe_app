import { useEffect } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { Text } from '@/components/ui/Text';
import { HAIRLINE } from '@/components/ui/tokens';
import { FontFamily } from '@/constants/typography';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

/** Opening moment: the mark, the line, and why Pinch exists. */
export function OnboardingVision() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(
      withTiming(1, { duration: 2800, easing: Easing.inOut(Easing.sin) }),
      -1,
      true,
    );
  }, [pulse, reduceMotion]);

  const halo = useAnimatedStyle(() => ({
    transform: [{ scale: reduceMotion ? 1 : 1 + pulse.value * 0.06 }],
    opacity: reduceMotion ? 0.7 : 0.5 + pulse.value * 0.3,
  }));

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.duration(520).delay(delay).springify().damping(18);

  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 8 }}>
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(480)}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{ width: 176, height: 176, marginBottom: 36, alignItems: 'center', justifyContent: 'center' }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: 176,
              height: 176,
              borderRadius: 88,
              backgroundColor: colors.primarySoft,
            },
            halo,
          ]}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 132,
            height: 132,
            borderRadius: 66,
            borderWidth: HAIRLINE,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        />
        <View
          style={{
            width: 88,
            height: 88,
            borderRadius: 28,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primary,
          }}
        >
          <CookieMark size={50} color={colors.onPrimary} />
        </View>
      </Animated.View>

      <Animated.View entering={enter(80)} style={{ alignItems: 'center', maxWidth: 340, alignSelf: 'stretch' }}>
        {/* The name is Latin in every language. */}
        <Text
          accessibilityLabel="Pinch"
          align="center"
          color={colors.primaryText}
          style={{
            fontFamily: FontFamily.spaceGroteskBold,
            fontSize: 15,
            lineHeight: 20,
            letterSpacing: 3,
            writingDirection: 'ltr',
          }}
        >
          PINCH
        </Text>
        <Text
          variant="h1"
          align="center"
          style={{ marginTop: 12, fontSize: 38, lineHeight: type.rtl ? 48 : 42, letterSpacing: type.tracking(-0.025, 38) }}
        >
          {t('onboarding.welcomeTitle')}
        </Text>
        <Text tone="muted" align="center" style={{ marginTop: 16, fontSize: 17, lineHeight: 26 }}>
          {t('onboarding.visionBody')}
        </Text>
      </Animated.View>
    </View>
  );
}
