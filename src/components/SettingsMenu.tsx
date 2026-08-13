import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode } from 'react';
import { Pressable, Text, View } from 'react-native';

import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';

type SettingsGroupProps = {
  title?: string;
  children: ReactNode;
  danger?: boolean;
};

/** Frosted grouped list — iOS Settings-style section. */
export function SettingsGroup({ title, children, danger = false }: SettingsGroupProps) {
  const { colors } = useThemePreference();

  return (
    <View className="mb-5">
      {title ? (
        <Text
          className="mb-2 px-1 text-xs font-bold uppercase tracking-wide"
          style={{ color: danger ? colors.warning : colors.textSecondary }}
        >
          {title}
        </Text>
      ) : null}
      <View
        className="overflow-hidden rounded-[22px] border px-4"
        style={{
          backgroundColor: colors.frosted,
          borderColor: danger ? colors.warning : colors.frostedBorder,
        }}
      >
        {children}
      </View>
    </View>
  );
}

type SettingsRowProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  value?: string;
  destructive?: boolean;
  last?: boolean;
  disabled?: boolean;
  chevron?: boolean;
};

/** One tappable settings choice: icon, label, current value, chevron. */
export function SettingsRow({
  label,
  icon,
  onPress,
  value,
  destructive = false,
  last = false,
  disabled = false,
  chevron = true,
}: SettingsRowProps) {
  const { colors } = useThemePreference();
  const { chevronForward } = useRtl();
  const color = destructive ? colors.warning : colors.text;

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={value ? `${label}, ${value}` : label}
      className="min-h-[52px] flex-row items-center gap-3 py-3 active:opacity-65 disabled:opacity-50"
      style={{
        borderColor: colors.frostedBorder,
        borderBottomWidth: last ? 0 : 1,
      }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: destructive ? colors.warningSoft : colors.primarySoft }}
      >
        <Ionicons name={icon} size={18} color={destructive ? colors.warning : colors.primary} />
      </View>
      <Text className="min-w-0 shrink text-sm font-semibold" style={{ color }} numberOfLines={1}>
        {label}
      </Text>
      <View className="min-w-0 flex-1 flex-row items-center justify-end gap-1.5">
        {value ? (
          <Text
            className="min-w-0 text-sm"
            style={{ color: destructive ? colors.warning : colors.textSecondary }}
            numberOfLines={1}
          >
            {value}
          </Text>
        ) : null}
        {chevron ? (
          <Ionicons
            name={chevronForward}
            size={17}
            color={destructive ? colors.warning : colors.textSecondary}
          />
        ) : null}
      </View>
    </Pressable>
  );
}
