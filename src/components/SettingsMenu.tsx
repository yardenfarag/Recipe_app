import { Children, Fragment, isValidElement, type ReactNode } from 'react';
import { ActivityIndicator, View, type StyleProp, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, type IconSource } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

type SettingsGroupProps = {
  /** The small caps above the tile: "PREFERENCES". */
  title?: string;
  /** A muted line under the title. */
  description?: string;
  /** Rows (SettingsRow or anything else). Hairlines are drawn between them; `null` children are skipped. */
  children: ReactNode;
  /** The title in the danger colour (account deletion). */
  danger?: boolean;
  style?: StyleProp<ViewStyle>;
};

/**
 * A group of settings rows on one tile (Night Market, PIN-177), with its small-caps title above and hairlines
 * between the rows.
 *
 *   <SettingsGroup title={t('settings.yourSettings')}>
 *     <SettingsRow icon="color-palette-outline" label={t('settings.appearance')} value="Auto" onPress={…} trackId="settings.appearance" />
 *   </SettingsGroup>
 */
export function SettingsGroup({ title, description, children, danger = false, style }: SettingsGroupProps) {
  const { colors } = useThemePreference();
  const rows = Children.toArray(children).filter((child) => isValidElement(child));

  return (
    <View style={[{ gap: 10 }, style]}>
      {title ? (
        <View style={{ gap: 4, paddingHorizontal: 4 }}>
          <TileLabel accessibilityRole="header" tone={danger ? 'danger' : undefined}>
            {title}
          </TileLabel>
          {description ? (
            <Text variant="caption" tone="muted">
              {description}
            </Text>
          ) : null}
        </View>
      ) : null}
      <Tile style={{ paddingHorizontal: 8, paddingVertical: 4, overflow: 'hidden' }}>
        {rows.map((row, index) => (
          <Fragment key={(isValidElement(row) && row.key) || index}>
            {index > 0 ? (
              <View
                style={{ height: HAIRLINE, backgroundColor: colors.border, marginStart: 56, marginEnd: 8 }}
                accessible={false}
                importantForAccessibility="no"
              />
            ) : null}
            {row}
          </Fragment>
        ))}
      </Tile>
    </View>
  );
}

/** The 36 × 36 rounded square an icon sits in at the start of a row. */
export function RowIcon({ icon, danger = false }: { icon: IconSource; danger?: boolean }) {
  const { colors } = useThemePreference();
  return (
    <View
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: danger ? colors.dangerSoft : colors.backgroundElement,
      }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <KitIcon icon={icon} size={18} color={danger ? colors.danger : colors.text} />
    </View>
  );
}

type SettingsRowProps = {
  label: string;
  icon: IconSource;
  onPress: () => void;
  /** The current choice, muted at the end of the row ("Auto · Mist"). */
  value?: string;
  /** A muted line under the label, for rows with no current value. */
  description?: string;
  /** Deleting things: label and icon in the danger colour. */
  destructive?: boolean;
  disabled?: boolean;
  /** Shows a spinner in place of the chevron. */
  busy?: boolean;
  /** A small filled badge before the chevron, such as "New" on a feature not yet opened. */
  badge?: string;
  /** The chevron at the end (mirrored in Hebrew and Arabic). Default true. */
  chevron?: boolean;
  /** "link" for rows that leave the app (mailto, a website). */
  role?: 'button' | 'link';
  /** Fixed tap-log id, like 'settings.appearance'. */
  trackId: string;
};

/** One tappable settings choice: icon, label (with a hint under it), current value and chevron at the end. */
export function SettingsRow({
  label,
  icon,
  onPress,
  value,
  description,
  destructive = false,
  disabled = false,
  busy = false,
  badge,
  chevron = true,
  role = 'button',
  trackId,
}: SettingsRowProps) {
  const { colors } = useThemePreference();
  const spoken = [label, badge, value, description].filter(Boolean).join(', ');

  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole={role}
      accessibilityState={{ disabled, busy }}
      accessibilityLabel={spoken}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        paddingVertical: 10,
        paddingHorizontal: 8,
        borderRadius: 18,
        backgroundColor: pressed ? colors.backgroundElement : 'transparent',
        opacity: disabled && !busy ? 0.5 : 1,
      })}
    >
      <RowIcon icon={icon} danger={destructive} />
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Text variant="bodySmall" weight="semibold" tone={destructive ? 'danger' : 'default'}>
          {label}
        </Text>
        {description ? (
          <Text variant="caption" tone="muted" numberOfLines={2}>
            {description}
          </Text>
        ) : null}
      </View>
      {value ? (
        <Text variant="bodySmall" tone="muted" numberOfLines={1} style={{ flexShrink: 1, maxWidth: '45%' }}>
          {value}
        </Text>
      ) : null}
      {badge ? <TileBadge>{badge}</TileBadge> : null}
      {busy ? (
        <ActivityIndicator size="small" color={colors.textSecondary} />
      ) : chevron ? (
        <KitIcon icon="chevron-forward" size={18} color={destructive ? colors.danger : colors.textSecondary} />
      ) : null}
    </Pressable>
  );
}
