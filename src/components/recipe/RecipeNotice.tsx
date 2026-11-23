import { type ReactNode } from 'react';
import { View, type ViewProps } from 'react-native';

import { Text } from '@/components/ui/Text';
import { HAIRLINE, KitIcon, Radii, type IconName } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

export type RecipeNoticeTone = 'surface' | 'primary' | 'accent' | 'warning';

/**
 * A note on the recipe page (a translation, a remix, an allergy, a guess, missing details): a flat card in a soft
 * tint with an icon, a title, lines of text and its buttons. No border except on the surface tone.
 */
export function RecipeNotice({
  tone = 'surface',
  icon,
  title,
  children,
  actions,
  ...rest
}: ViewProps & {
  tone?: RecipeNoticeTone;
  icon?: IconName;
  title?: ReactNode;
  children?: ReactNode;
  /** Buttons at the bottom (kit Buttons). */
  actions?: ReactNode;
}) {
  const { colors } = useThemePreference();
  const fills: Record<RecipeNoticeTone, { bg: string; border?: string; icon: string }> = {
    surface: { bg: colors.surface, border: colors.border, icon: colors.textSecondary },
    primary: { bg: colors.primarySoft, icon: colors.primaryText },
    accent: { bg: colors.accentSoft, icon: colors.accentText },
    warning: { bg: colors.warningSoft, icon: colors.warning },
  };
  const fill = fills[tone];
  return (
    <View
      {...rest}
      style={[
        {
          gap: 8,
          padding: 16,
          borderRadius: Radii.card,
          backgroundColor: fill.bg,
          borderWidth: fill.border ? HAIRLINE : 0,
          borderColor: fill.border,
        },
        rest.style,
      ]}
    >
      {title != null ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          {icon ? <KitIcon icon={icon} color={fill.icon} size={18} /> : null}
          <Text variant="bodySmall" weight="semibold" accessibilityRole="header" style={{ flex: 1, minWidth: 0 }}>
            {title}
          </Text>
        </View>
      ) : null}
      {children}
      {actions ? <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 4 }}>{actions}</View> : null}
    </View>
  );
}
