import { forwardRef } from 'react';
import {
  Platform,
  StyleSheet,
  TextInput as RNTextInput,
  type TextInputProps,
  type TextStyle,
} from 'react-native';

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
    // Match pinch `rounded-2xl` (1.25rem) so the web focus ring isn't a sharp rect.
    borderRadius: 20,
  },
});
