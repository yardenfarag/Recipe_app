import { View } from 'react-native';
import Animated, { useAnimatedStyle, withSpring } from 'react-native-reanimated';

import { useThemePreference } from '@/hooks/useThemePreference';

type OnboardingProgressProps = {
  count: number;
  index: number;
};

function Dot({ active, color, soft }: { active: boolean; color: string; soft: string }) {
  const style = useAnimatedStyle(() => ({
    width: withSpring(active ? 22 : 7, { damping: 16, stiffness: 180 }),
    backgroundColor: active ? color : soft,
    opacity: withSpring(active ? 1 : 0.55, { damping: 16, stiffness: 180 }),
  }));

  return <Animated.View className="mx-0.5 h-[7px] rounded-full" style={style} />;
}

/** Morphing progress dots for the onboarding pager. */
export function OnboardingProgress({ count, index }: OnboardingProgressProps) {
  const { colors } = useThemePreference();

  return (
    <View className="flex-row items-center justify-center py-3" accessibilityRole="progressbar">
      {Array.from({ length: count }, (_, i) => (
        <Dot key={i} active={i === index} color={colors.primary} soft={colors.primarySoft} />
      ))}
    </View>
  );
}
