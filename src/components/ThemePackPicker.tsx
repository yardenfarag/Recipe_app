import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle, Ellipse, G, Line, Path } from 'react-native-svg';

import { useThemePreference } from '@/hooks/useThemePreference';
import {
  THEME_PACK_ORDER,
  ThemePacks,
  type ThemePackId,
} from '@/constants/themes';

function PackIcon({ id, primary, accent }: { id: ThemePackId; primary: string; accent: string }) {
  const common = { width: 36, height: 36, viewBox: '0 0 36 36' } as const;

  switch (id) {
    case 'mist':
      return (
        <Svg {...common}>
          <Ellipse cx="12" cy="22" rx="9" ry="6" fill={primary} opacity={0.85} />
          <Ellipse cx="20" cy="18" rx="11" ry="8" fill={accent} opacity={0.9} />
          <Ellipse cx="28" cy="23" rx="7" ry="5" fill={primary} opacity={0.75} />
        </Svg>
      );
    case 'fruity':
      return (
        <Svg {...common}>
          <Path
            d="M18 8 C22 4 28 6 28 12 C28 20 24 30 18 32 C12 30 8 20 8 12 C8 6 14 4 18 8Z"
            fill={primary}
          />
          <Path d="M14 9 C16 5 18 4 18 4 C18 4 20 5 22 9 C19 8 17 8 14 9Z" fill={accent} />
          <Circle cx="14" cy="16" r="1.2" fill="#FFF8E8" opacity={0.55} />
          <Circle cx="20" cy="19" r="1.1" fill="#FFF8E8" opacity={0.5} />
          <Circle cx="15" cy="23" r="1" fill="#FFF8E8" opacity={0.45} />
        </Svg>
      );
    case 'cat':
      return (
        <Svg {...common}>
          <Path d="M8 16 L6 6 L15 12 Z" fill={primary} />
          <Path d="M28 16 L30 6 L21 12 Z" fill={primary} />
          <Ellipse cx="18" cy="21" rx="11" ry="10" fill={primary} />
          <Circle cx="14" cy="19" r="1.8" fill="#2A2634" opacity={0.5} />
          <Circle cx="22" cy="19" r="1.8" fill="#2A2634" opacity={0.5} />
          <Path d="M18 22 L16.5 24.5 L19.5 24.5 Z" fill="#2A2634" opacity={0.4} />
        </Svg>
      );
    case 'wizard':
      return (
        <Svg {...common}>
          <Circle cx="11" cy="18" r="7" fill="none" stroke={primary} strokeWidth="2.2" />
          <Circle cx="25" cy="18" r="7" fill="none" stroke={primary} strokeWidth="2.2" />
          <Path d="M18 18 H18.5" stroke={primary} strokeWidth="2" strokeLinecap="round" />
          <Path d="M28 6 L24 14 H27 L24 22 L32 12 H28 Z" fill={accent} />
        </Svg>
      );
    case 'dracula':
      return (
        <Svg {...common}>
          <Path d="M6 10 Q18 4 30 10 L30 16 Q18 12 6 16 Z" fill={primary} />
          <Path d="M11 14 L14 30 L17 14 Z" fill="#F4EDE6" />
          <Path d="M19 14 L22 30 L25 14 Z" fill="#F4EDE6" />
          <Path d="M14 28 C14 28 15 34 14 34" stroke={accent} strokeWidth="1.6" fill="none" />
        </Svg>
      );
    case 'sunny':
      return (
        <Svg {...common}>
          <G>
            {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
              <Line
                key={deg}
                x1="18"
                y1="4"
                x2="18"
                y2="8"
                stroke={accent}
                strokeWidth="2.2"
                strokeLinecap="round"
                transform={`rotate(${deg} 18 18)`}
              />
            ))}
          </G>
          <Circle cx="18" cy="18" r="8" fill={primary} />
        </Svg>
      );
    case 'starry':
      return (
        <Svg {...common}>
          <Path
            d="M24 4 C16 6 12 14 14 22 C16 28 24 30 30 24 C22 26 16 20 16 14 C16 10 20 5 24 4Z"
            fill={accent}
          />
          <Path
            d="M10 8 L11.2 11.2 L14.5 11.5 L12 13.8 L12.8 17 L10 15.2 L7.2 17 L8 13.8 L5.5 11.5 L8.8 11.2 Z"
            fill={primary}
          />
        </Svg>
      );
    default:
      return (
        <Svg {...common}>
          <Circle cx="18" cy="18" r="10" fill={primary} />
        </Svg>
      );
  }
}

/** Scrollable grid of Drift theme packs for Settings. */
export function ThemePackPicker() {
  const { t } = useTranslation();
  const { packId, setPackId, colors } = useThemePreference();

  return (
    <View className="gap-2.5">
      {THEME_PACK_ORDER.map((id) => {
        const pack = ThemePacks[id];
        const active = packId === id;
        const [swatchA, swatchB] = pack.swatches;
        return (
          <Pressable
            key={id}
            onPress={() => setPackId(id as ThemePackId)}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            className="flex-row items-center gap-3 rounded-[18px] px-3.5 py-3 active:opacity-80"
            style={{
              backgroundColor: active ? colors.primarySoft : 'transparent',
              borderWidth: 1,
              borderColor: active ? colors.primary : colors.frostedBorder,
            }}
          >
            <View
              className="items-center justify-center rounded-2xl"
              style={{
                width: 48,
                height: 48,
                backgroundColor: active ? colors.surface : colors.surfaceSoft,
              }}
            >
              <PackIcon id={id} primary={swatchA} accent={swatchB} />
            </View>
            <View className="min-w-0 flex-1">
              <Text
                className="text-sm font-semibold"
                style={{ color: active ? colors.primary : colors.text }}
              >
                {t(`themes.${id}.name`)}
              </Text>
              <Text
                className="mt-0.5 text-xs leading-4"
                style={{ color: colors.textSecondary }}
                numberOfLines={2}
              >
                {t(`themes.${id}.blurb`)}
              </Text>
            </View>
            {active ? (
              <View
                className="h-2.5 w-2.5 rounded-full"
                style={{ backgroundColor: colors.primary }}
              />
            ) : null}
          </Pressable>
        );
      })}
    </View>
  );
}
