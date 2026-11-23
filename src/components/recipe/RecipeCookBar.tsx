import { LinearGradient } from 'expo-linear-gradient';
import { type ReactNode } from 'react';
import { View, type LayoutChangeEvent } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { withAlpha } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

/**
 * The bar fixed to the bottom of the recipe page (PIN-177): what a cook does next ("Start cooking", add to the
 * list), always within reach of a thumb, over a fade to the page colour, clear of the home indicator. Report its
 * height with `onHeight` so the page can leave room for it under the last step.
 */
export function RecipeCookBar({ children, onHeight }: { children: ReactNode; onHeight?: (height: number) => void }) {
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  return (
    <View
      pointerEvents="box-none"
      onLayout={(event: LayoutChangeEvent) => onHeight?.(event.nativeEvent.layout.height)}
      style={{ position: 'absolute', start: 0, end: 0, bottom: 0 }}
    >
      <LinearGradient
        pointerEvents="none"
        colors={[withAlpha(colors.background, 0), colors.background]}
        locations={[0, 0.4]}
        style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
      />
      <View
        pointerEvents="box-none"
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
          paddingHorizontal: 16,
          paddingTop: 24,
          paddingBottom: Math.max(insets.bottom, 16),
        }}
      >
        {children}
      </View>
    </View>
  );
}
