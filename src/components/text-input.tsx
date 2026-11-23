import { forwardRef, useState, type ReactNode } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput as RNTextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';

import { Text } from '@/components/ui/Text';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';

export type { TextInputProps };

/** Web-only — kept out of StyleSheet.create so native doesn't warn on outline*. */
const webFocusReset: TextStyle | null =
  Platform.OS === 'web'
    ? ({ outlineWidth: 0, outlineStyle: 'none' } as unknown as TextStyle)
    : null;

/**
 * Drop-in TextInput that keeps glyphs vertically centered on iOS/web.
 * NativeWind `text-*` utilities include a lineHeight (e.g. text-base → 24)
 * that UITextField treats as extra leading, so the value sinks and clips.
 * Alignment styles come last so they win over className.
 */
export const TextInput = forwardRef<RNTextInput, TextInputProps>(function TextInput(
  { style, multiline, textAlignVertical, ...rest },
  ref,
) {
  return (
    <RNTextInput
      ref={ref}
      {...rest}
      multiline={multiline}
      textAlignVertical={textAlignVertical ?? (multiline ? 'top' : 'center')}
      style={[
        Platform.OS === 'web' && styles.webFill,
        style,
        styles.field,
        !multiline && styles.singleLine,
        webFocusReset,
      ]}
    />
  );
});

/** Field heights: md (52) for a form's fields, sm (44) for the small boxes in an editor row. */
const FIELD_HEIGHT = { md: 52, sm: 44 } as const;

export type FieldInputProps = TextInputProps & {
  /** Red border: the value needs fixing. A message under it comes from `TextField`'s `error`. */
  invalid?: boolean;
  /** Before the value, such as a small Ionicons glyph in `colors.textSecondary`. Hidden from screen readers. */
  leading?: ReactNode;
  /** Inside the field's end, such as a show/hide password IconButton. */
  trailing?: ReactNode;
  /** md 52 (default) or sm 44 tall. A multiline field grows from 96. */
  size?: keyof typeof FIELD_HEIGHT;
  /** Layout of the box (width, flex). `style` styles the text. */
  containerStyle?: StyleProp<ViewStyle>;
};

/**
 * A Night Market text box (PIN-177), as on the web's TextField: the surface colour with a hairline border and 16
 * corners, the border turning the brand colour while typing and red when `invalid`. Text in Inter, 16, aligned to
 * the reading direction.
 *
 *   <FieldInput value={email} onChangeText={setEmail} accessibilityLabel={t('auth.email')} />
 */
export const FieldInput = forwardRef<RNTextInput, FieldInputProps>(function FieldInput(
  { invalid = false, leading, trailing, size = 'md', containerStyle, style, multiline, onFocus, onBlur, editable, ...rest },
  ref,
) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const { textAlign, writingDirection } = useRtl();
  const [focused, setFocused] = useState(false);
  const borderColor = invalid ? colors.danger : focused ? colors.primary : colors.border;

  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 10,
          minHeight: multiline ? 96 : FIELD_HEIGHT[size],
          paddingHorizontal: size === 'sm' ? 12 : 16,
          borderRadius: Radii.inner,
          borderWidth: focused && !invalid ? 1.5 : HAIRLINE,
          borderColor,
          backgroundColor: colors.surface,
          opacity: editable === false ? 0.6 : 1,
        },
        containerStyle,
      ]}
    >
      {leading ? (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={multiline ? { paddingTop: 14 } : undefined}
        >
          {leading}
        </View>
      ) : null}
      <TextInput
        ref={ref}
        placeholderTextColor={colors.textSecondary}
        {...rest}
        editable={editable}
        multiline={multiline}
        onFocus={(event) => {
          setFocused(true);
          onFocus?.(event);
        }}
        onBlur={(event) => {
          setFocused(false);
          onBlur?.(event);
        }}
        style={[
          type.font('body', 'regular'),
          {
            flex: 1,
            minWidth: 0,
            alignSelf: 'stretch',
            fontSize: 16,
            color: colors.text,
            textAlign,
            writingDirection,
            paddingHorizontal: 0,
            paddingVertical: multiline ? 12 : 0,
            minHeight: multiline ? 94 : undefined,
          },
          style,
        ]}
      />
      {trailing ? <View style={{ marginEnd: -6 }}>{trailing}</View> : null}
    </View>
  );
});

export type TextFieldProps = FieldInputProps & {
  /** Shown over the field, and read out as its name unless `accessibilityLabel` says otherwise. */
  label: string;
  /** A muted line under the field. */
  hint?: string | null;
  /** A red line under the field (and a red border); replaces the hint. */
  error?: string | null;
  /** Something at the end of the label's row, such as "Forgot password?". */
  labelEnd?: ReactNode;
  style?: StyleProp<TextStyle>;
};

/**
 * A labelled FieldInput with a hint or an error under it, as on the web (web/components/ui/TextField.tsx).
 *
 *   <TextField label={t('auth.email')} value={email} onChangeText={setEmail} error={emailError} />
 */
export const TextField = forwardRef<RNTextInput, TextFieldProps>(function TextField(
  { label, hint, error, labelEnd, invalid, accessibilityLabel, accessibilityHint, ...rest },
  ref,
) {
  return (
    <View style={{ gap: 6 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <Text variant="bodySmall" weight="semibold" style={{ flexShrink: 1 }}>
          {label}
        </Text>
        {labelEnd}
      </View>
      <FieldInput
        ref={ref}
        {...rest}
        invalid={invalid || Boolean(error)}
        accessibilityLabel={accessibilityLabel ?? label}
        accessibilityHint={accessibilityHint ?? (error || hint || undefined)}
      />
      {error ? (
        <Text variant="caption" tone="danger" weight="medium" accessibilityLiveRegion="polite">
          {error}
        </Text>
      ) : hint ? (
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      ) : null}
    </View>
  );
});

const styles = StyleSheet.create({
  field: {
    ...Platform.select({
      android: { includeFontPadding: false },
      default: {},
    }),
  },
  singleLine: {
    ...Platform.select({
      android: {},
      default: { lineHeight: 20 },
    }),
  },
  /** UA stylesheet paints a Field fill behind the value — keep the wrapper as the surface. */
  webFill: {
    backgroundColor: 'transparent',
    // The field's 16 corners, so the web focus ring isn't a sharp rect.
    borderRadius: 16,
  },
});
