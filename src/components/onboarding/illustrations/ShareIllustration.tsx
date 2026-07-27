import { useEffect, useState } from 'react';
import { AccessibilityInfo, Text, View } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { PhoneFrame } from '@/components/onboarding/illustrations/PhoneFrame';
import { useThemePreference } from '@/hooks/useThemePreference';

/** Share sheet card sliding into Pinch. */
export function ShareIllustration() {
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);
  const offset = useSharedValue(18);

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
      offset.value = 0;
      return;
    }
    offset.value = withRepeat(
      withSequence(
        withTiming(0, { duration: 900, easing: Easing.out(Easing.cubic) }),
        withTiming(0, { duration: 700 }),
        withTiming(18, { duration: 500, easing: Easing.in(Easing.cubic) }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, offset]);

  const cardStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: offset.value }],
    opacity: 1 - offset.value / 40,
  }));

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <PhoneFrame>
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12 }}>
          <View
            style={{
              height: 48,
              width: 48,
              alignItems: 'center',
              justifyContent: 'center',
              borderRadius: 18,
              backgroundColor: colors.primarySoft,
            }}
          >
            <CookieMark size={28} color={colors.primary} />
          </View>
          <Text style={{ fontSize: 12, fontWeight: '600', color: colors.textSecondary }}>
            Pinch
          </Text>
          <Animated.View
            style={[
              {
                width: '100%',
                borderRadius: 18,
                borderWidth: 1,
                borderColor: colors.primary,
                backgroundColor: colors.primarySoft,
                paddingHorizontal: 14,
                paddingVertical: 12,
                overflow: 'hidden',
              },
              cardStyle,
            ]}
          >
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
              Share recipe
            </Text>
            <Text style={{ marginTop: 4, fontSize: 10, color: colors.textSecondary }}>
              TikTok · Instagram · YouTube
            </Text>
          </Animated.View>
        </View>
      </PhoneFrame>
    </View>
  );
}
