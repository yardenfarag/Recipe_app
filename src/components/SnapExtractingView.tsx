import { useEffect, useState } from 'react';
import { AccessibilityInfo, View } from 'react-native';
import Animated, {
  Easing,
  FadeIn,
  FadeInDown,
  FadeOut,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { useThemePreference } from '@/hooks/useThemePreference';

type SnapExtractingViewProps = {
  statusLines: readonly string[];
  statusIndex: number;
};

/** Full-screen Snap extract wait — heartbeat cookie + rotating status. */
export function SnapExtractingView({ statusLines, statusIndex }: SnapExtractingViewProps) {
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);
  const beat = useSharedValue(0);
  const ring = useSharedValue(0);

  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion);
    return () => sub.remove();
  }, []);

  useEffect(() => {
    if (reduceMotion) {
      beat.value = 0;
      return;
    }
    beat.value = withRepeat(
      withSequence(
        withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
        withTiming(0.2, { duration: 140, easing: Easing.in(Easing.cubic) }),
        withTiming(1, { duration: 180, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 620, easing: Easing.inOut(Easing.sin) }),
      ),
      -1,
      false,
    );
  }, [beat, reduceMotion]);

  useEffect(() => {
    if (reduceMotion) {
      ring.value = 0.35;
      return;
    }
    ring.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.out(Easing.cubic) }),
      -1,
      false,
    );
  }, [reduceMotion, ring]);

  const cookieStyle = useAnimatedStyle(() => ({
    transform: [{ scale: 1 + beat.value * 0.14 }],
  }));

  const ringStyle = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.2, 1], [0.45, 0.28, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.85, 1.55]) }],
  }));

  const ring2Style = useAnimatedStyle(() => ({
    opacity: interpolate(ring.value, [0, 0.35, 1], [0.3, 0.18, 0]),
    transform: [{ scale: interpolate(ring.value, [0, 1], [0.95, 1.9]) }],
  }));

  return (
    <View
      className="flex-1 items-center justify-center px-8"
      accessibilityRole="progressbar"
      accessibilityLabel={statusLines[statusIndex]}
    >
      <View className="mb-10 h-44 w-44 items-center justify-center">
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 140,
              height: 140,
              borderRadius: 70,
              borderWidth: 2,
              borderColor: colors.primary,
            },
            ring2Style,
          ]}
        />
        <Animated.View
          style={[
            {
              position: 'absolute',
              width: 120,
              height: 120,
              borderRadius: 60,
              borderWidth: 2,
              borderColor: colors.accent,
            },
            ringStyle,
          ]}
        />
        <Animated.View style={cookieStyle}>
          <CookieMark size={88} color={colors.primary} />
        </Animated.View>
      </View>

      <Animated.Text
        key={statusIndex}
        entering={reduceMotion ? FadeIn.duration(160) : FadeInDown.springify().damping(18)}
        exiting={FadeOut.duration(160)}
        className="text-center text-xl font-semibold"
        style={{ color: colors.text }}
      >
        {statusLines[statusIndex]}
      </Animated.Text>
    </View>
  );
}
