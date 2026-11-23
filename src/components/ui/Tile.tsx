import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState, type ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewProps, type ViewStyle } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { BADGE_TRACKING_EM } from '@/constants/typography';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { recipeImageSource } from '@/lib/recipeImageSource';

import { Text, type TextProps } from './Text';
import { HAIRLINE, Radii, usePhotoColors, withAlpha } from './tokens';

export type TileTone = 'surface' | 'primary' | 'element' | 'plain';
export type TileSize = 'sm' | 'md' | 'lg';

const TILE_RADIUS: Record<TileSize, number> = { lg: Radii.tile, md: Radii.card, sm: Radii.inner };

/** The fill, border and corners of a tile, for a component that draws its own (an Animated.View). */
export function useTileStyle(tone: TileTone = 'surface', size: TileSize = 'lg'): ViewStyle {
  const { colors } = useThemePreference();
  const fills: Record<TileTone, ViewStyle> = {
    surface: { backgroundColor: colors.surface, borderWidth: HAIRLINE, borderColor: colors.border },
    primary: { backgroundColor: colors.primary },
    element: { backgroundColor: colors.backgroundElement },
    plain: {},
  };
  return { borderRadius: TILE_RADIUS[size], ...fills[tone] };
}

export type TileProps = ViewProps & {
  /**
   * surface (the default): surface colour with a hairline border. primary: the one tile on a screen that asks for
   * the main action (put `tone="onPrimary"` text on it). element: a tile inside a tile. plain: corners only.
   */
  tone?: TileTone;
  /** Corners: lg 28 (a page tile, the default), md 24 (a card in a list), sm 16 (a tile inside a tile). */
  size?: TileSize;
  /** Inner padding on all sides. Leave it out to pad with `style`. */
  padding?: number;
  /** Makes the whole tile a button: it darkens a little while pressed. Give it a `trackId` and a label. */
  onPress?: () => void;
  onLongPress?: () => void;
  /** Fixed id for the admin Activity log, like 'library.card'. Needed with `onPress`. */
  trackId?: string;
  disabled?: boolean;
};

/**
 * A bento tile, the block every Night Market screen is built from (flat: no shadow).
 *
 *   <Tile padding={20}><TileLabel>{t('web.library.cookedThisWeek')}</TileLabel>…</Tile>
 *   <Tile size="md" onPress={open} trackId="library.card" accessibilityLabel={title}>…</Tile>
 */
export function Tile({
  tone = 'surface',
  size = 'lg',
  padding,
  onPress,
  onLongPress,
  trackId,
  disabled,
  style,
  children,
  ...rest
}: TileProps) {
  const { colors } = useThemePreference();
  const base = useTileStyle(tone, size);
  const padded = padding == null ? null : { padding };

  if (!onPress && !onLongPress) {
    return (
      <View {...rest} style={[base, padded, style]}>
        {children}
      </View>
    );
  }

  return (
    <Pressable
      {...rest}
      trackId={trackId}
      onPress={onPress}
      onLongPress={onLongPress}
      disabled={disabled}
      accessibilityRole={rest.accessibilityRole ?? 'button'}
      accessibilityState={{ disabled: Boolean(disabled) }}
      style={({ pressed }) => [
        base,
        padded,
        pressed && tone === 'surface' ? { backgroundColor: colors.backgroundElement } : null,
        pressed && tone !== 'surface' ? { opacity: 0.88 } : null,
        disabled ? { opacity: 0.5 } : null,
        style as StyleProp<ViewStyle>,
      ]}
    >
      {children}
    </Pressable>
  );
}

/**
 * The small-caps line at the top of a tile: "COOKED THIS WEEK". In capitals and spaced out only where the script
 * has capitals (not Hebrew or Arabic). Muted unless given a `tone`.
 */
export function TileLabel(props: Omit<TextProps, 'variant'>) {
  return <Text {...props} variant="label" />;
}

/**
 * The small caps as a filled badge, on a tile (soft: primarySoft with primaryText) or over a photo (photo: the
 * pack's dark primary): "TONIGHT'S PICK".
 *
 *   <TileBadge>{t('library.cookTonight')}</TileBadge>
 */
export function TileBadge({
  tone = 'soft',
  icon,
  children,
  style,
}: {
  tone?: 'soft' | 'photo';
  /** Drawn before the words, such as a small Ionicons glyph in `color`. */
  icon?: ReactNode;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemePreference();
  const photo = usePhotoColors();
  const type = useTypography();
  const bg = tone === 'photo' ? photo.scrimPrimary : colors.primarySoft;
  const fg = tone === 'photo' ? photo.onScrimPrimary : colors.primaryText;
  return (
    <View
      style={[
        {
          flexDirection: 'row',
          alignItems: 'center',
          alignSelf: 'flex-start',
          maxWidth: '100%',
          gap: 6,
          borderRadius: 8,
          paddingHorizontal: 10,
          paddingVertical: 6,
          backgroundColor: bg,
        },
        style,
      ]}
    >
      {icon}
      <Text
        numberOfLines={1}
        color={fg}
        style={{
          ...type.font('display', 'bold'),
          fontSize: 12,
          lineHeight: 14,
          letterSpacing: type.tracking(BADGE_TRACKING_EM, 12),
          textTransform: type.caps ? 'uppercase' : 'none',
        }}
      >
        {children}
      </Text>
    </View>
  );
}

export type PhotoTileProps = {
  /** A photo URL (TikTok and Instagram ones get the headers their CDNs want) or a bundled `require()`. */
  src?: string | number | null;
  /** What the photo shows, read out. Leave it out when the words on the tile say it already. */
  alt?: string;
  /** Shown instead of the photo when there is none or it fails to load: an icon, a cookie mark. */
  fallback?: ReactNode;
  /**
   * bottom (the default): darkens the lower part for words. strong: darkens more of it, for a tall block of words
   * over any photo. none: leaves the photo alone (buttons on it bring their own backing: IconButton variant photo).
   */
  fade?: 'bottom' | 'strong' | 'none';
  onPhotoError?: () => void;
  /** Corners, as on Tile. Default lg (28). */
  size?: TileSize;
  /** The words and buttons on top, laid out at the bottom. Use `tone="onScrim"` text. */
  children?: ReactNode;
  /** Style of the tile (give it a height or an aspectRatio). */
  style?: StyleProp<ViewStyle>;
  /** Style of the layer the children sit in (padding, gap, justifyContent). */
  contentStyle?: StyleProp<ViewStyle>;
  onPress?: () => void;
  trackId?: string;
  accessibilityLabel?: string;
};

/**
 * A photo filling a tile, fading to the scrim at the bottom, with words and buttons on top. Colours over a photo are
 * the pack's dark ones in light mode too (`tone="onScrim"`, `usePhotoColors()`), since a photo doesn't change with
 * the theme.
 *
 *   <PhotoTile src={recipe.image_url} style={{ aspectRatio: 4 / 5 }} contentStyle={{ padding: 18 }}>
 *     <Text variant="h3" tone="onScrim">{recipe.title}</Text>
 *   </PhotoTile>
 */
export function PhotoTile({
  src,
  alt,
  fallback,
  fade = 'bottom',
  onPhotoError,
  size = 'lg',
  children,
  style,
  contentStyle,
  onPress,
  trackId,
  accessibilityLabel,
}: PhotoTileProps) {
  const photo = usePhotoColors();
  const [failedSrc, setFailedSrc] = useState<string | number | null>(null);
  const showPhoto = src != null && src !== '' && failedSrc !== src;
  const radius = TILE_RADIUS[size];

  const layers = (
    <>
      {showPhoto ? (
        <Image
          source={typeof src === 'string' ? recipeImageSource(src) : src}
          style={StyleSheet.absoluteFill}
          contentFit="cover"
          transition={300}
          recyclingKey={typeof src === 'string' ? src : undefined}
          accessible={Boolean(alt)}
          accessibilityLabel={alt}
          onError={() => {
            setFailedSrc(src);
            onPhotoError?.();
          }}
        />
      ) : (
        <View
          accessible={false}
          importantForAccessibility="no-hide-descendants"
          style={[StyleSheet.absoluteFill, { alignItems: 'center', justifyContent: 'center' }]}
        >
          {fallback}
        </View>
      )}
      {fade === 'none' ? null : (
        <LinearGradient
          pointerEvents="none"
          colors={
            fade === 'strong'
              ? [withAlpha(photo.scrim, 0), withAlpha(photo.scrim, 0.8), withAlpha(photo.scrim, 0.95)]
              : [withAlpha(photo.scrim, 0), withAlpha(photo.scrim, 0.9)]
          }
          locations={fade === 'strong' ? [0.1, 0.45, 1] : [0.3, 1]}
          style={StyleSheet.absoluteFill}
        />
      )}
      {children ? <View style={[{ flex: 1, justifyContent: 'flex-end' }, contentStyle]}>{children}</View> : null}
    </>
  );

  const tileStyle: StyleProp<ViewStyle> = [
    { borderRadius: radius, overflow: 'hidden', backgroundColor: photo.scrim },
    style,
  ];

  if (!onPress) return <View style={tileStyle}>{layers}</View>;
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [tileStyle, pressed ? { opacity: 0.9 } : null]}
    >
      {layers}
    </Pressable>
  );
}

/**
 * One fact as a tile: a small-caps label over a big number in the accent colour, with something at the end of the
 * number's row (`aside`: an icon, a few photos).
 *
 *   <StatTile label={t('web.library.cookedThisWeek')} value={3} />
 */
export function StatTile({
  label,
  value,
  aside,
  tone = 'surface',
  style,
}: {
  label: ReactNode;
  value: ReactNode;
  aside?: ReactNode;
  tone?: 'surface' | 'element';
  style?: StyleProp<ViewStyle>;
}) {
  return (
    <Tile tone={tone} style={[{ padding: 20, gap: 12, justifyContent: 'space-between' }, style]}>
      <TileLabel>{label}</TileLabel>
      <View style={{ flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 }}>
        <Text variant="number">{value}</Text>
        {aside}
      </View>
    </Tile>
  );
}

/**
 * A small fact inside a tile: the value (17, Space Grotesk bold) over a short label (11, semibold, muted). Four sit
 * in a row on the recipe screen: "25m" / "Total time".
 *
 *   <FactTile value="25m" label={t('recipe.totalTime')} style={{ flex: 1 }} />
 */
export function FactTile({
  value,
  label,
  style,
}: {
  value: ReactNode;
  label: ReactNode;
  style?: StyleProp<ViewStyle>;
}) {
  const { colors } = useThemePreference();
  const type = useTypography();
  return (
    <View
      accessible
      style={[
        {
          minWidth: 0,
          gap: 2,
          borderRadius: Radii.fact,
          backgroundColor: colors.backgroundElement,
          paddingHorizontal: 14,
          paddingVertical: 12,
        },
        style,
      ]}
    >
      <Text
        numberOfLines={1}
        style={{ ...type.font('display', 'bold'), fontSize: 17, lineHeight: 22, letterSpacing: type.tracking(-0.015, 17) }}
      >
        {value}
      </Text>
      <Text
        numberOfLines={2}
        tone="muted"
        style={{ ...type.font('body', 'semibold'), fontSize: 11, lineHeight: 14 }}
      >
        {label}
      </Text>
    </View>
  );
}
