import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { PhoneFrame } from '@/components/onboarding/illustrations/PhoneFrame';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTranslation } from 'react-i18next';

const CHIP_KEYS = [
  'onboarding.chipDinner',
  'onboarding.chipBaking',
  'onboarding.chipWeeknight',
] as const;

/** Soft collection chips that pulse into place. */
export function CollectionsIllustration() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);
  const pulse = useSharedValue(0);

  useEffect(() => {
    let mounted = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((enabled) => {
      if (mounted) setReduceMotion(enabled);
    });
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      pulse.value = 1;
      return;
    }
    pulse.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 700 }),
        withDelay(900, withTiming(0.35, { duration: 500 })),
        withTiming(1, { duration: 600 }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, pulse]);

  const glowStyle = useAnimatedStyle(() => ({
    opacity: 0.45 + pulse.value * 0.55,
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <PhoneFrame>
        <View style={{ flex: 1, justifyContent: 'center', gap: 10 }}>
          <Text
            style={{
              marginBottom: 2,
              fontSize: 11,
              fontWeight: '600',
              color: colors.textSecondary,
            }}
          >
            Collections
          </Text>
          {CHIP_KEYS.map((key, index) => (
            <Animated.View
              key={key}
              entering={
                reduceMotion ? undefined : FadeInDown.delay(index * 90).springify().damping(16)
              }
              style={[
                {
                  borderRadius: 16,
                  borderWidth: 1,
                  borderColor: index === 0 ? colors.primary : colors.border,
                  backgroundColor: index === 0 ? colors.primarySoft : colors.background,
                  paddingHorizontal: 14,
                  paddingVertical: 11,
                  overflow: 'hidden',
                },
                index === 0 ? glowStyle : null,
              ]}
            >
              <Text
                style={{
                  textAlign: 'center',
                  fontSize: 12,
                  fontWeight: '600',
                  color: index === 0 ? colors.primary : colors.text,
                }}
                numberOfLines={1}
              >
                {t(key)}
              </Text>
            </Animated.View>
          ))}
        </View>
      </PhoneFrame>
    </View>
  );
}
