import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, Text, View } from 'react-native';

import { useThemePreference, type ThemePreference } from '@/hooks/useThemePreference';

const LABELS: Record<ThemePreference, string> = {
  system: 'Auto',
  light: 'Light',
  dark: 'Dark',
};

const ICONS: Record<ThemePreference, keyof typeof Ionicons.glyphMap> = {
  system: 'phone-portrait-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
};

type ThemeToggleProps = {
  /** Compact icon-only control for headers — cycles modes on tap. */
  compact?: boolean;
};

/** Theme control: compact cycles modes; full shows Auto / Light / Dark. */
export function ThemeToggle({ compact = false }: ThemeToggleProps) {
  const { preference, colors, setPreference, cyclePreference } = useThemePreference();

  if (compact) {
    return (
      <Pressable
        onPress={cyclePreference}
        accessibilityRole="button"
        accessibilityLabel={`Theme: ${LABELS[preference]}. Tap to change.`}
        className="h-10 w-10 items-center justify-center rounded-[16px] active:opacity-70"
        style={{ backgroundColor: colors.primarySoft }}
        hitSlop={8}
      >
        <Ionicons name={ICONS[preference]} size={20} color={colors.primary} />
      </Pressable>
    );
  }

  return (
    <View
      className="flex-row rounded-[18px] p-1"
      style={{ backgroundColor: colors.primarySoft }}
    >
      {(['system', 'light', 'dark'] as ThemePreference[]).map((mode) => {
        const active = preference === mode;
        return (
          <Pressable
            key={mode}
            onPress={() => setPreference(mode)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2"
            style={active ? { backgroundColor: colors.surface } : undefined}
          >
            <Ionicons
              name={ICONS[mode]}
              size={16}
              color={active ? colors.primary : colors.textSecondary}
            />
            <Text
              className="text-xs font-semibold"
              style={{ color: active ? colors.primary : colors.textSecondary }}
            >
              {LABELS[mode]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
