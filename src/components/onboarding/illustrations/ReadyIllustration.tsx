import { View } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';

import { CookieMark } from '@/components/CookieMark';
import { useThemePreference } from '@/hooks/useThemePreference';

/** Calm brand mark for the final ready step — no boxed frame. */
export function ReadyIllustration() {
  const { colors } = useThemePreference();

  return (
    <View className="items-center justify-center py-6">
      <Animated.View entering={FadeInDown.springify().damping(14)}>
        <CookieMark size={56} color={colors.primary} />
      </Animated.View>
    </View>
  );
}
