import Ionicons from '@expo/vector-icons/Ionicons';
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

import { PhoneFrame } from '@/components/onboarding/illustrations/PhoneFrame';
import { useThemePreference } from '@/hooks/useThemePreference';

/** Ingredient swap + remix + list — icon-first, no cramped labels. */
export function CustomizeIllustration() {
  const { colors } = useThemePreference();
  const [reduceMotion, setReduceMotion] = useState(false);
  const slide = useSharedValue(0);

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
      slide.value = 0;
      return;
    }
    slide.value = withRepeat(
      withSequence(
        withTiming(-6, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(6, { duration: 700, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 500, easing: Easing.inOut(Easing.quad) }),
        withTiming(0, { duration: 600 }),
      ),
      -1,
      false,
    );
  }, [reduceMotion, slide]);

  const arrowStyle = useAnimatedStyle(() => ({
    transform: [{ translateX: slide.value }],
  }));

  const cardBase = {
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    overflow: 'hidden' as const,
  };

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center' }}>
      <PhoneFrame>
        <View style={{ flex: 1, justifyContent: 'center', gap: 12 }}>
          <View
            style={{
              ...cardBase,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.background,
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'space-between',
            }}
          >
            <View
              style={{
                height: 36,
                width: 36,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primarySoft,
              }}
            >
              <Ionicons name="nutrition-outline" size={18} color={colors.textSecondary} />
            </View>
            <Animated.View style={arrowStyle}>
              <Ionicons name="swap-horizontal" size={20} color={colors.primary} />
            </Animated.View>
            <View
              style={{
                height: 36,
                width: 36,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.primarySoft,
              }}
            >
              <Ionicons name="leaf-outline" size={18} color={colors.primary} />
            </View>
          </View>
          <View style={{ ...cardBase, backgroundColor: colors.primarySoft }}>
            <Text style={{ fontSize: 11, fontWeight: '700', color: colors.primary }}>
              Remix · vegan
            </Text>
            <Text style={{ marginTop: 4, fontSize: 10, color: colors.textSecondary }}>
              Sign in to transform
            </Text>
          </View>
          <View
            style={{
              ...cardBase,
              borderWidth: 1,
              borderColor: colors.border,
            }}
          >
            <Text style={{ fontSize: 11, fontWeight: '600', color: colors.text }}>
              + Shopping list
            </Text>
          </View>
        </View>
      </PhoneFrame>
    </View>
  );
}
