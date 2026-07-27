import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { PhoneFrame } from '@/components/onboarding/illustrations/PhoneFrame';
import { useThemePreference } from '@/hooks/useThemePreference';

/** Preview card with a save check that settles in. */
export function SaveIllustration() {
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);
  const scale = useSharedValue(0.6);
  const opacity = useSharedValue(0);

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
      scale.value = 1;
      opacity.value = 1;
      return;
    }
    scale.value = withRepeat(
      withSequence(
        withTiming(0.6, { duration: 0 }),
        withDelay(200, withSpring(1.08, { damping: 10, stiffness: 160 })),
        withSpring(1, { damping: 14, stiffness: 180 }),
        withTiming(1, { duration: 900 }),
        withTiming(0.6, { duration: 350, easing: Easing.in(Easing.cubic) }),
      ),
      -1,
      false,
    );
    opacity.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 0 }),
        withDelay(200, withTiming(1, { duration: 280 })),
        withTiming(1, { duration: 1100 }),
        withTiming(0, { duration: 300 }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, scale, opacity]);

  const checkStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }],
    opacity: opacity.value,
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <PhoneFrame>
        <View style={{ flex: 1, gap: 10 }}>
          <View
            style={{
              height: 64,
              width: '100%',
              borderRadius: 18,
              backgroundColor: colors.primarySoft,
            }}
          />
          <View style={{ gap: 6, paddingHorizontal: 2 }}>
            <View
              style={{
                height: 10,
                width: '75%',
                borderRadius: 999,
                backgroundColor: colors.border,
              }}
            />
            <View
              style={{
                height: 8,
                width: '50%',
                borderRadius: 999,
                backgroundColor: colors.border,
              }}
            />
          </View>
          <View
            style={{
              marginTop: 'auto',
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.textSecondary }}>
              Preview
            </Text>
            <Animated.View
              style={[
                {
                  height: 36,
                  width: 36,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: 18,
                  backgroundColor: colors.primary,
                },
                checkStyle,
              ]}
            >
              <Text style={{ fontSize: 14, fontWeight: '700', color: '#fff' }}>✓</Text>
            </Animated.View>
          </View>
        </View>
      </PhoneFrame>
    </View>
  );
}
