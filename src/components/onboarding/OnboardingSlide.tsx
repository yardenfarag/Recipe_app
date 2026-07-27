import { useEffect, useState, type ReactNode } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, { FadeIn, FadeInDown } from 'react-native-reanimated';

import { useThemePreference } from '@/hooks/useThemePreference';

type OnboardingSlideProps = {
  title: string;
  body: string;
  illustration: ReactNode;
  /** Remount key so entrances replay when the step changes. */
  stepKey: string | number;
};

/** Shared layout for teaching / ready slides: illustration → title → body. */
export function OnboardingSlide({ title, body, illustration, stepKey }: OnboardingSlideProps) {
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);

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

  const enterTitle = reduceMotion ? FadeIn.duration(180) : FadeInDown.delay(80).springify().damping(18);
  const enterBody = reduceMotion ? FadeIn.duration(180) : FadeInDown.delay(140).springify().damping(18);
  const enterArt = reduceMotion ? FadeIn.duration(180) : FadeInDown.springify().damping(16);

  return (
    <View className="flex-1 items-center justify-center px-1" key={stepKey}>
      <View className="w-full items-center gap-5">
        <Animated.View entering={enterArt} className="items-center justify-center">
          {illustration}
        </Animated.View>
        <View className="w-full max-w-[340px] gap-2 px-1">
          <Animated.View entering={enterTitle}>
            <Text
              className="text-center text-[22px] font-bold leading-[28px]"
              style={{ color: colors.text, letterSpacing: -0.3 }}
            >
              {title}
            </Text>
          </Animated.View>
          <Animated.View entering={enterBody}>
            <Text
              className="text-center text-[14px] leading-[21px]"
              style={{ color: colors.textSecondary }}
            >
              {body}
            </Text>
          </Animated.View>
        </View>
      </View>
    </View>
  );
}
