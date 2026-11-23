import Ionicons from '@expo/vector-icons/Ionicons';
import { type ComponentProps, type ReactNode } from 'react';
import { type LayoutChangeEvent, type StyleProp, View, type ViewStyle } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FieldInput, type FieldInputProps } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton as KitIconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge } from '@/components/ui/Tile';
import { useThemePreference } from '@/hooks/useThemePreference';
import type { EditorMessage } from '@shared/lib/recipeEditor';

/** Translates an editor message (i18n key + params). */
export function useEditorMessage() {
  const { t } = useTranslation();
  return (message: EditorMessage | undefined) =>
    message ? t(message.key, message.params as Record<string, unknown> | undefined) : null;
}

/** One part of the form, as a tile (Night Market, PIN-177): its heading (h2) and its fields. */
export function EditorSection({
  title,
  hint,
  children,
  onLayout,
}: {
  title: string;
  /** A muted line under the heading. */
  hint?: string;
  children: ReactNode;
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  return (
    <Tile onLayout={onLayout} padding={20} style={{ gap: 18 }}>
      <View style={{ gap: 4 }}>
        <Text variant="h2">{title}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </Tile>
  );
}

type FieldProps = {
  label: string;
  children: ReactNode;
  error?: string | null;
  /** Shows "Set by you" with a reset action for a locked AI-derived field. */
  locked?: boolean;
  onReset?: () => void;
  /** Admin Activity log id for the reset action. */
  resetTrackId?: string;
};

export function EditorField({ label, children, error, locked, onReset, resetTrackId }: FieldProps) {
  return (
    <View>
      <View
        style={{
          marginBottom: 8,
          minHeight: 22,
          flexDirection: 'row',
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
          columnGap: 8,
        }}
      >
        <Text variant="bodySmall" weight="semibold">
          {label}
        </Text>
        {locked && onReset ? <LockedBadge onReset={onReset} trackId={resetTrackId} /> : null}
      </View>
      {children}
      <FieldError message={error} />
    </View>
  );
}

/**
 * "Set by you", with the way back to Pinch's own estimate (ADR 018): a value the cook typed is never overwritten by a
 * recalculation until they reset it.
 */
export function LockedBadge({
  onReset,
  trackId = 'recipe_editor.field.reset',
}: {
  onReset: () => void;
  trackId?: string;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: 4 }}>
      <TileBadge icon={<Ionicons name="person" size={11} color={colors.primaryText} />}>
        {t('recipeEditor.locked.setByYou')}
      </TileBadge>
      <Button variant="link" icon="refresh" trackId={trackId} onPress={onReset}>
        {t('recipeEditor.locked.reset')}
      </Button>
    </View>
  );
}

export function FieldError({ message }: { message?: string | null }) {
  if (!message) return null;
  return (
    <Text variant="caption" tone="danger" weight="medium" style={{ marginTop: 6 }} accessibilityLiveRegion="polite">
      {message}
    </Text>
  );
}

/**
 * A text box in the editor: the Night Market field (FieldInput), 52 tall (`size="sm"`, 44, in an ingredient row).
 * `style` lays out the box (a width, flex).
 */
export function EditorInput({
  style,
  ...props
}: Omit<FieldInputProps, 'containerStyle' | 'style'> & { style?: StyleProp<ViewStyle> }) {
  return <FieldInput {...props} containerStyle={style} />;
}

/** The kit's 44 × 44 icon button, for a row's delete. */
export function IconButton({
  icon,
  label,
  onPress,
  color,
  trackId = 'recipe_editor.row.delete',
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  label: string;
  onPress: () => void;
  color?: string;
  trackId?: string;
}) {
  return <KitIconButton icon={icon} label={label} onPress={onPress} color={color} trackId={trackId} iconSize={20} />;
}

/** Adds a row (an ingredient, a step, an appliance): a secondary button with a plus. */
export function AddRowButton({
  label,
  onPress,
  disabled,
  trackId = 'recipe_editor.row.add',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  trackId?: string;
}) {
  return (
    <Button variant="secondary" icon="add" trackId={trackId} onPress={onPress} disabled={disabled}>
      {label}
    </Button>
  );
}

export function ChoiceChips<T extends string>({
  options,
  value,
  onChange,
  label,
  trackId = 'recipe_editor.choice',
}: {
  options: { value: T; label: string }[];
  value: T | null;
  /** Tapping the selected chip clears it. */
  onChange: (value: T | null) => void;
  label: string;
  /**
   * Prefix for the admin Activity log id. The option value is appended when it
   * is id-safe (like 'Easy'), otherwise its 1-based position (cost '$' -> 1).
   */
  trackId?: string;
}) {
  return (
    <View
      style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Chip
            key={option.value}
            kind="radio"
            size="sm"
            selected={selected}
            trackId={`${trackId}.${/^[A-Za-z0-9_-]+$/.test(option.value) ? option.value : index + 1}`}
            onPress={() => onChange(selected ? null : option.value)}
          >
            {option.label}
          </Chip>
        );
      })}
    </View>
  );
}
