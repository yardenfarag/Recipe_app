import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { KitIcon, MIN_TOUCH, Radii, type IconName } from '@/components/ui/tokens';
import { useThemePreference, type ThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { CHROME_MAX_FONT_SCALE } from '@/lib/a11y';

const ICONS: Record<ThemePreference, IconName> = {
  system: 'phone-portrait-outline',
  light: 'sunny-outline',
  dark: 'moon-outline',
};

type ThemeToggleProps = {
  /** Compact icon-only control for headers — cycles modes on tap. */
  compact?: boolean;
  /**
   * Prefix for the admin Activity log ids: `<trackId>.cycle` (compact) or
   * `<trackId>.light` / `.dark` / `.system`. A fixed string.
   */
  trackId?: string;
};

/**
 * Light, dark or automatic. Compact: an icon button that cycles them. Full: the three side by side on an
 * element-coloured track, the chosen one on a surface thumb, like the kit's SegmentedControl, but with the icon
 * over the name so "Как в системе" fits a phone in three columns.
 */
export function ThemeToggle({ compact = false, trackId = 'theme' }: ThemeToggleProps) {
  const { t } = useTranslation();
  const { preference, colors, setPreference, cyclePreference } = useThemePreference();
  const type = useTypography();

  const labels: Record<ThemePreference, string> = {
    system: t('theme.auto'),
    light: t('theme.light'),
    dark: t('theme.dark'),
  };

  if (compact) {
    return (
      <IconButton
        variant="tile"
        icon={ICONS[preference]}
        label={t('theme.a11y', { mode: labels[preference] })}
        trackId={`${trackId}.cycle`}
        onPress={cyclePreference}
      />
    );
  }

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('settings.lightDark')}
      style={{
        flexDirection: 'row',
        gap: 4,
        padding: 4,
        borderRadius: Radii.control,
        backgroundColor: colors.backgroundElement,
      }}
    >
      {(['system', 'light', 'dark'] as ThemePreference[]).map((mode) => {
        const active = preference === mode;
        const fg = active ? colors.text : colors.textSecondary;
        return (
          <Pressable
            trackId={`${trackId}.${mode}`}
            key={mode}
            onPress={() => setPreference(mode)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={labels[mode]}
            style={{
              flex: 1,
              minWidth: 0,
              minHeight: MIN_TOUCH + 12,
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              paddingHorizontal: 6,
              paddingVertical: 8,
              borderRadius: 10,
              backgroundColor: active ? colors.surface : 'transparent',
            }}
          >
            <KitIcon icon={ICONS[mode]} color={fg} size={18} />
            <Text
              align="center"
              color={fg}
              numberOfLines={2}
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
              style={{ ...type.font('body', 'semibold'), fontSize: 13, lineHeight: 17 }}
            >
              {labels[mode]}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}
