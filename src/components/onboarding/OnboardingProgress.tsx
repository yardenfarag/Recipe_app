import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { useThemePreference } from '@/hooks/useThemePreference';

type OnboardingProgressProps = {
  count: number;
  index: number;
};

function Dot({ active, color, soft }: { active: boolean; color: string; soft: string }) {
  const style = useAnimatedStyle(() => ({
    width: withSpring(active ? 24 : 8, { damping: 16, stiffness: 180 }),
    backgroundColor: active ? color : soft,
  }));

  return <Animated.View style={[{ marginHorizontal: 3, height: 8, borderRadius: 4 }, style]} />;
}

/** Morphing progress dots for the onboarding pager. */
export function OnboardingProgress({ count, index }: OnboardingProgressProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const current = Math.min(Math.max(index + 1, 1), count);

  return (
    <View
      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: 12 }}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t('a11y.stepOf', { current, total: count })}
      accessibilityValue={{ min: 1, max: count, now: current }}
    >
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} active={i === index} color={colors.primary} soft={colors.backgroundSelected} />
      ))}
    </View>
  );
}
