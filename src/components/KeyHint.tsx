import { Text, View } from 'react-native';

import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemePreference } from '@/hooks/useThemePreference';

/**
 * A small keycap that shows a keyboard shortcut, such as "/" in a search
 * field. Desktop website only; renders nothing on phones, tablets and in the
 * mobile apps, where there is no keyboard to press it on.
 */
export function KeyHint({ label }: { label: string }) {
  const { isDesktopWeb } = useBreakpoint();
  const { colors } = useThemePreference();
  if (!isDesktopWeb) return null;

  return (
    <View
      aria-hidden
      className="h-6 min-w-[24px] items-center justify-center rounded-lg border px-1.5"
      style={{ borderColor: colors.frostedBorder, backgroundColor: colors.background }}
    >
      <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
        {label}
      </Text>
    </View>
  );
}
