import { useEffect } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import Animated, {
  cancelAnimation,
  Easing,
  interpolate,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';

/**
 * The cookie mark gently bobbing on a soft brand tile, with an optional line under it: for a screen whose first data
 * hasn't come back yet. Still when the phone asks for reduced motion. Read out as `label`.
 *
 *   <CookieLoader label={t('a11y.loadingRecipes')} caption={t('library.opening')} />
 */
export function CookieLoader({
  label,
  caption,
  style,
}: {
  label: string;
  caption?: string;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemePreference();
  const reduceMotion = useReducedMotion();
  const pulse = useSharedValue(0);

  useEffect(() => {
    if (reduceMotion) return;
    pulse.value = withRepeat(withTiming(1, { duration: 900, easing: Easing.inOut(Easing.sin) }), -1, true);
    return () => cancelAnimation(pulse);
  }, [pulse, reduceMotion]);

  const bob = useAnimatedStyle(() => ({
    opacity: interpolate(pulse.value, [0, 1], [0.7, 1]),
    transform: [
      { scale: interpolate(pulse.value, [0, 1], [0.94, 1.06]) },
      { rotate: `${interpolate(pulse.value, [0, 1], [-8, 8])}deg` },
    ],
  }));

  return (
    <View
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      style={[{ alignItems: 'center', gap: 16 }, style]}
    >
      <Animated.View
        style={[
          {
            width: 72,
            height: 72,
            borderRadius: 24,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.primarySoft,
          },
          bob,
        ]}
      >
        <CookieMark size={40} color={colors.primaryText} />
      </Animated.View>
      {caption ? (
        <Text variant="bodySmall" tone="muted" align="center">
          {caption}
        </Text>
      ) : null}
    </View>
  );
}
