import { View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';

/** An on/off setting: its name and what it does, with a switch at the end. The whole row toggles it. */
export function SettingsSwitchRow({
  label,
  hint,
  value,
  onToggle,
  trackId,
  disabled = false,
}: {
  label: string;
  hint: string;
  value: boolean;
  onToggle: () => void;
  trackId: string;
  disabled?: boolean;
}) {
  const { colors } = useThemePreference();
  return (
    <Pressable
      trackId={trackId}
      onPress={onToggle}
      disabled={disabled}
      accessibilityRole="switch"
      accessibilityState={{ checked: value, disabled }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        marginHorizontal: -8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 16,
        opacity: disabled ? 0.5 : 1,
        backgroundColor: pressed ? colors.backgroundElement : 'transparent',
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="bodySmall" weight="semibold">
          {label}
        </Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </View>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          padding: 3,
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? colors.primary : colors.backgroundSelected,
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface }} />
      </View>
    </Pressable>
  );
}
