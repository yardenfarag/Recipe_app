import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { type LayoutChangeEvent, Pressable, Text, View, type TextStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { TextInput, type TextInputProps } from '@/components/text-input';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import type { EditorMessage } from '@/lib/recipeEditor';

/** Translates an editor message (i18n key + params). */
export function useEditorMessage() {
  const { t } = useTranslation();
  return (message: EditorMessage | undefined) =>
    message ? t(message.key, message.params as Record<string, unknown> | undefined) : null;
}

export function EditorSection({
  title,
  children,
  onLayout,
}: {
  title: string;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const { colors } = useThemePreference();
  return (
    <View
      onLayout={onLayout}
      className="mb-4 rounded-[24px] border p-4"
      style={{ borderColor: colors.frostedBorder, backgroundColor: colors.frosted }}
    >
      <Text className="mb-3 text-lg font-bold" style={{ color: colors.text }} accessibilityRole="header">
        {title}
      </Text>
      <View className="gap-4">{children}</View>
    </View>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  error?: string | null;
  /** Shows "Set by you" with a reset action for a locked AI-derived field. */
  locked?: boolean;
  onReset?: () => void;
};

export function EditorField({ label, children, error, locked, onReset }: FieldProps) {
  const { colors } = useThemePreference();
  const { textAlign } = useRtl();
  return (
    <View>
      <View className="mb-1.5 flex-row flex-wrap items-center justify-between gap-2">
        <Text className="text-sm font-semibold" style={{ color: colors.textSecondary, textAlign }}>
          {label}
        </Text>
        {locked && onReset ? <LockedBadge onReset={onReset} /> : null}
      </View>
      {children}
      <FieldError message={error} />
    </View>
  );
}

export function LockedBadge({ onReset }: { onReset: () => void }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  return (
    <View className="flex-row flex-wrap items-center gap-2">
      <View className="flex-row items-center gap-1 rounded-full px-2 py-0.5" style={{ backgroundColor: colors.accentSoft }}>
        <Ionicons name="person" size={11} color={colors.text} />
        <Text className="text-xs font-semibold" style={{ color: colors.text }}>
          {t('recipeEditor.locked.setByYou')}
        </Text>
      </View>
      <Pressable onPress={onReset} hitSlop={8} accessibilityRole="button" className="active:opacity-70">
        <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
          {t('recipeEditor.locked.reset')}
        </Text>
      </Pressable>
    </View>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  const { colors } = useThemePreference();
  const { textAlign } = useRtl();
  if (!message) return null;
  return (
    <Text
      className="mt-1 text-xs"
      style={{ color: colors.danger, textAlign }}
      accessibilityLiveRegion="polite"
    >
      {message}
    </Text>
  );
}

/** Themed single- or multi-line input matching the app's rounded fields. */
export function EditorInput({ style, invalid, ...props }: TextInputProps & { invalid?: boolean }) {
  const { colors } = useThemePreference();
  const { textAlign, writingDirection } = useRtl();
  const base: TextStyle = {
    color: colors.text,
    borderColor: invalid ? colors.danger : colors.frostedBorder,
    backgroundColor: colors.surface,
    textAlign,
    writingDirection,
  };
  return (
    <TextInput
      className={`rounded-2xl border px-3 text-base ${props.multiline ? 'min-h-[72px] py-2.5' : 'min-h-[44px] py-2.5'}`}
      placeholderTextColor={colors.textSecondary}
      {...props}
      style={[base, style]}
    />
  );
}

export function IconButton({
  icon,
  label,
  onPress,
  color,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  color?: string;
}) {
  const { colors } = useThemePreference();
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      className="h-11 w-9 items-center justify-center rounded-xl active:opacity-70"
    >
      <Ionicons name={icon} size={20} color={color ?? colors.textSecondary} />
    </Pressable>
  );
}

export function AddRowButton({ label, onPress, disabled }: { label: string; onPress: () => void; disabled?: boolean }) {
  const { colors } = useThemePreference();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled: Boolean(disabled) }}
      className="min-h-[44px] items-center justify-center rounded-2xl border border-dashed px-4 active:opacity-70"
      style={{ borderColor: colors.border, opacity: disabled ? 0.5 : 1 }}
    >
      <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
        {label}
      </Text>
    </Pressable>
  );
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T | null;
  /** Tapping the selected chip clears it. */
  onChange: (value: T | null) => void;
  label: string;
}) {
  const { colors } = useThemePreference();
  return (
    <View className="flex-row flex-wrap gap-2" accessibilityRole="radiogroup" accessibilityLabel={label}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            onPress={() => onChange(selected ? null : option.value)}
            accessibilityRole="radio"
            accessibilityState={{ selected }}
            className="min-h-[40px] justify-center rounded-full border px-4 active:opacity-80"
            style={{
              borderColor: selected ? colors.primary : colors.frostedBorder,
              backgroundColor: selected ? colors.primarySoft : colors.surface,
            }}
          >
            <Text className="text-sm font-semibold" style={{ color: selected ? colors.primary : colors.text }}>
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
