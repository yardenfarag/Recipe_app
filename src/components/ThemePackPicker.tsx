import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { HAIRLINE, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { THEME_PACK_ORDER, ThemePacks, type ThemePackId } from '@shared/constants/themes';

type ThemePackPickerProps = {
  /** Tap-log id prefix; each pack logs as `<trackId>.<packId>`. */
  trackId?: string;
};

/**
 * The theme packs as tiles, two to a row, each a small picture of itself in light or dark as the app is now: its
 * background with a card on it, a button in its brand colour, a dot in its accent, and its name in its own text
 * colour (as on the web, web/components/settings/AppearanceSettings.tsx). The chosen one has a ring in the current
 * pack's brand colour.
 */
export function ThemePackPicker({ trackId = 'settings.theme_pack' }: ThemePackPickerProps = {}) {
  const { t } = useTranslation();
  const { packId, setPackId, colors, scheme } = useThemePreference();
  const type = useTypography();

  return (
    <View
      accessibilityRole="radiogroup"
      accessibilityLabel={t('settings.driftTheme')}
      style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: 12, justifyContent: 'space-between' }}
    >
      {THEME_PACK_ORDER.map((id) => {
        const active = packId === id;
        // The pack's own colours, not this screen's, so every pack shows its look before it is chosen.
        const own = ThemePacks[id][scheme];
        const name = t(`themes.${id}.name`);
        const blurb = t(`themes.${id}.blurb`);
        return (
          <Pressable
            trackId={`${trackId}.${id}`}
            key={id}
            onPress={() => setPackId(id as ThemePackId)}
            accessibilityRole="radio"
            accessibilityState={{ checked: active }}
            accessibilityLabel={`${name}, ${blurb}`}
            style={({ pressed }) => ({
              // Two columns with about 12 between them; an odd last tile stays half wide.
              width: '48.3%',
              borderRadius: Radii.card + 4,
              padding: 3,
              borderWidth: 2,
              borderColor: active ? colors.primary : 'transparent',
              opacity: pressed ? 0.88 : 1,
            })}
          >
            <View
              style={{
                flex: 1,
                gap: 12,
                padding: 12,
                borderRadius: Radii.card,
                borderWidth: HAIRLINE,
                borderColor: own.border,
                backgroundColor: own.background,
              }}
            >
              <View
                accessible={false}
                importantForAccessibility="no-hide-descendants"
                style={{
                  gap: 8,
                  padding: 10,
                  borderRadius: Radii.inner,
                  borderWidth: HAIRLINE,
                  borderColor: own.border,
                  backgroundColor: own.surface,
                }}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: own.accent }} />
                  <View style={{ height: 7, width: '60%', borderRadius: 4, backgroundColor: own.text }} />
                </View>
                <View style={{ height: 7, width: '80%', borderRadius: 4, backgroundColor: own.backgroundElement }} />
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ height: 20, width: '55%', borderRadius: 10, backgroundColor: own.primary }} />
                  <View style={{ height: 20, width: 20, borderRadius: 6, backgroundColor: own.accentSoft }} />
                </View>
              </View>
              <View style={{ gap: 2 }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 6 }}>
                  <Text
                    color={own.text}
                    numberOfLines={2}
                    style={{ ...type.font('display', 'bold'), fontSize: 15, lineHeight: 20, flex: 1 }}
                  >
                    {name}
                  </Text>
                  {active ? (
                    <View
                      accessible={false}
                      importantForAccessibility="no-hide-descendants"
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: 10,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: own.primary,
                      }}
                    >
                      <Ionicons name="checkmark" size={14} color={own.onPrimary} />
                    </View>
                  ) : null}
                </View>
                <Text variant="caption" color={own.textSecondary} numberOfLines={3}>
                  {blurb}
                </Text>
              </View>
            </View>
          </Pressable>
        );
      })}
    </View>
  );
}
