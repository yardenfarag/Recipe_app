import { useEffect } from 'react';
import { Text, View } from 'react-native';
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
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { isRtlAppLanguage } from '@/lib/appLanguages';

/** Opening moment: the mark, the line, and why Pinch exists. */
export function OnboardingVision() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { language } = useLanguagePreference();
  const reduceMotion = useReducedMotion();
  const rtl = isRtlAppLanguage(language);
  const writingDirection = rtl ? ('rtl' as const) : ('ltr' as const);
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
    opacity: reduceMotion ? 0.55 : 0.35 + pulse.value * 0.25,
  }));

  const enter = (delay: number) =>
    reduceMotion ? undefined : FadeInDown.duration(520).delay(delay).springify().damping(18);

  return (
    <View className="flex-1 items-center justify-center px-2">
      <Animated.View
        entering={reduceMotion ? undefined : FadeIn.duration(480)}
        className="mb-8 items-center justify-center"
        style={{ width: 168, height: 168 }}
      >
        <Animated.View
          pointerEvents="none"
          style={[
            {
              position: 'absolute',
              width: 168,
              height: 168,
              borderRadius: 84,
              backgroundColor: colors.primarySoft,
            },
            halo,
          ]}
        />
        <View
          pointerEvents="none"
          style={{
            position: 'absolute',
            width: 124,
            height: 124,
            borderRadius: 62,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
            backgroundColor: colors.frosted,
          }}
        />
        <View
          className="items-center justify-center rounded-[32px]"
          style={{ width: 88, height: 88, backgroundColor: colors.primarySoft }}
        >
          <CookieMark size={48} color={colors.primary} />
        </View>
      </Animated.View>

      <Animated.View entering={enter(80)} className="items-center" style={{ maxWidth: 320 }}>
        <Text
          className="text-xs font-semibold"
          style={{
            color: colors.textSecondary,
            letterSpacing: 2.4,
            writingDirection: 'ltr',
            textAlign: 'center',
          }}
        >
          PINCH
        </Text>
        <Text
          className="mt-3 text-center text-[32px] font-bold tracking-tight"
          style={{
            color: colors.text,
            letterSpacing: rtl ? 0 : -0.6,
            writingDirection,
          }}
        >
          {t('onboarding.welcomeTitle')}
        </Text>
        <Text
          className="mt-4 text-center text-[16px] leading-6"
          style={{ color: colors.textSecondary, writingDirection }}
        >
          {t('onboarding.visionBody')}
        </Text>
      </Animated.View>
    </View>
  );
}
