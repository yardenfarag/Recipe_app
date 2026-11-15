import { type ReactNode } from 'react';
import { Switch, Text, View, type TextStyle } from 'react-native';

import { TextInput } from '@/components/text-input';
import { Pressable } from '@/components/ui/Pressable';
import { useThemePreference } from '@/hooks/useThemePreference';

/** A card in the admin style (frosted, rounded). */
export function Card({ title, hint, children }: { title?: string; hint?: string; children: ReactNode }) {
  const { colors } = useThemePreference();
  return (
    <View
      className="mb-4 rounded-[22px] p-4"
      style={{ backgroundColor: colors.frosted, borderWidth: 1, borderColor: colors.frostedBorder }}
    >
      {title ? (
        <Text className="text-base font-bold" style={{ color: colors.text }} accessibilityRole="header">
          {title}
        </Text>
      ) : null}
      {hint ? (
        <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
          {hint}
        </Text>
      ) : null}
      <View className={title || hint ? 'mt-3' : ''}>{children}</View>
    </View>
  );
}

/** Label above, control, then the field's errors in red and an optional hint. */
export function Field({
  label,
  hint,
  errors,
  required,
  children,
}: {
  label: string;
  hint?: string;
  errors?: readonly string[];
  required?: boolean;
  children: ReactNode;
}) {
  const { colors } = useThemePreference();
  return (
    <View className="mb-4">
      <Text className="mb-1 text-xs font-bold" style={{ color: colors.text }}>
        {label}
        {required ? <Text style={{ color: colors.danger }}> *</Text> : null}
      </Text>
      {children}
      {hint ? (
        <Text className="mt-1 text-xs" style={{ color: colors.textSecondary }}>
          {hint}
        </Text>
      ) : null}
      {errors?.map((message) => (
        <Text
          key={message}
          className="mt-1 text-xs font-semibold"
          style={{ color: colors.danger }}
          accessibilityRole="alert"
        >
          {message}
        </Text>
      ))}
    </View>
  );
}

export function TextField({
  value,
  onChangeText,
  placeholder,
  label,
  multiline,
  rtl,
  invalid,
  disabled,
  keyboardType,
  lines = 3,
}: {
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  /** Accessibility label; the visible one is on the Field. */
  label: string;
  multiline?: boolean;
  /** Typed right-to-left (Hebrew, Arabic). */
  rtl?: boolean;
  invalid?: boolean;
  disabled?: boolean;
  keyboardType?: 'default' | 'numeric' | 'url';
  lines?: number;
}) {
  const { colors } = useThemePreference();
  const direction: TextStyle | null = rtl ? { textAlign: 'right', writingDirection: 'rtl' } : null;
  return (
    <TextInput
      className="rounded-[14px] px-3 py-2 text-sm"
      style={[
        {
          color: colors.text,
          backgroundColor: colors.background,
          borderWidth: 1,
          borderColor: invalid ? colors.danger : colors.frostedBorder,
          opacity: disabled ? 0.5 : 1,
        },
        multiline ? { minHeight: 24 * lines, paddingTop: 8 } : null,
        direction,
      ]}
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor={colors.textSecondary}
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!disabled }}
      editable={!disabled}
      multiline={multiline}
      numberOfLines={multiline ? lines : 1}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType={keyboardType}
    />
  );
}

type Option<T extends string> = { value: T; label: string; disabled?: boolean };

/** Pick one. `trackPrefix` plus the option value is the fixed tap id. */
export function ChipRow<T extends string>({
  options,
  value,
  onChange,
  trackPrefix,
  label,
}: {
  options: readonly Option<T>[];
  value: T;
  onChange: (value: T) => void;
  trackPrefix: string;
  label: string;
}) {
  const { colors } = useThemePreference();
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const active = option.value === value;
        return (
          <Pressable
            key={option.value}
            trackId={`${trackPrefix}.${option.value}`}
            onPress={() => onChange(option.value)}
            disabled={option.disabled}
            accessibilityRole="radio"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: active, disabled: !!option.disabled }}
            className="rounded-full px-4 py-2"
            style={{
              backgroundColor: active ? colors.primary : colors.primarySoft,
              opacity: option.disabled ? 0.4 : 1,
            }}
          >
            <Text className="text-xs font-bold" style={{ color: active ? colors.onPrimary : colors.primary }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** Pick any number; none picked means "everyone". */
export function MultiChipRow<T extends string>({
  options,
  value,
  onChange,
  trackPrefix,
  label,
}: {
  options: readonly Option<T>[];
  value: readonly T[];
  onChange: (value: T[]) => void;
  trackPrefix: string;
  label: string;
}) {
  const { colors } = useThemePreference();
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityLabel={label}>
      {options.map((option) => {
        const active = value.includes(option.value);
        return (
          <Pressable
            key={option.value}
            trackId={`${trackPrefix}.${option.value}`}
            onPress={() =>
              onChange(active ? value.filter((v) => v !== option.value) : [...value, option.value])
            }
            accessibilityRole="checkbox"
            accessibilityLabel={option.label}
            accessibilityState={{ checked: active }}
            className="rounded-full px-4 py-2"
            style={{ backgroundColor: active ? colors.primary : colors.primarySoft }}
          >
            <Text className="text-xs font-bold" style={{ color: active ? colors.onPrimary : colors.primary }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function SwitchRow({
  label,
  hint,
  value,
  onChange,
  disabled,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
}) {
  const { colors } = useThemePreference();
  return (
    <View className="mb-4 flex-row items-center justify-between gap-3">
      <View className="min-w-0 flex-1">
        <Text className="text-sm font-semibold" style={{ color: colors.text }}>
          {label}
        </Text>
        {hint ? (
          <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary }}>
            {hint}
          </Text>
        ) : null}
      </View>
      <Switch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={label}
        trackColor={{ true: colors.primary, false: colors.border }}
      />
    </View>
  );
}

/** A small filled button. */
export function ActionButton({
  label,
  onPress,
  trackId,
  kind = 'primary',
  disabled,
  busy,
}: {
  label: string;
  onPress: () => void;
  trackId: string;
  kind?: 'primary' | 'soft' | 'danger';
  disabled?: boolean;
  busy?: boolean;
}) {
  const { colors } = useThemePreference();
  const background = kind === 'primary' ? colors.primary : kind === 'danger' ? colors.dangerSoft : colors.primarySoft;
  const color = kind === 'primary' ? colors.onPrimary : kind === 'danger' ? colors.danger : colors.primary;
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      disabled={disabled || busy}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || busy), busy: !!busy }}
      className="rounded-[14px] px-4 py-2.5"
      style={{ backgroundColor: background, opacity: disabled || busy ? 0.55 : 1 }}
    >
      <Text className="text-center text-sm font-bold" style={{ color }}>
        {busy ? `${label}…` : label}
      </Text>
    </Pressable>
  );
}
