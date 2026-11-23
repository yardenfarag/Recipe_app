import { type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { PhotoTile, Tile } from '@/components/ui/Tile';
import { KitIcon, MIN_TOUCH, Radii, usePhotoColors, withAlpha } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

/** How far the details sheet slides up over the photo. */
export const HERO_OVERLAP = 28;

export type HeroCookAlong = {
  /** "TikTok · jumps to each step". */
  hint: string;
  accessibilityLabel: string;
  onPress: () => void;
};

/**
 * The top of a recipe (PIN-177). With a photo on the recipe's own page (`immersive`), the photo fills the width
 * from the very top of the screen with back at the start and the page's buttons at the end, and "Cook along with the
 * video" near its bottom; the details sheet then slides up over its last 28 points. Elsewhere (a Hub or shared
 * recipe, under the screen's own header) the photo is a rounded tile. Without a photo there is no empty frame: just
 * the row of buttons, or a loader while Pinch draws the picture the owner asked for.
 */
export function RecipeHero({
  imageUrl,
  aiGenerated = false,
  onPhotoError,
  drawingPicture = false,
  immersive,
  topInset,
  onBack,
  actions,
  cookAlong,
}: {
  imageUrl: string | null;
  aiGenerated?: boolean;
  onPhotoError: () => void;
  drawingPicture?: boolean;
  immersive: boolean;
  /** The status bar's height, which the photo runs under. */
  topInset: number;
  /** Shows the back button at the start. */
  onBack?: () => void;
  /** Buttons at the end of the top row, given the variant to draw them in. */
  actions: (variant: 'photo' | 'tile') => ReactNode;
  cookAlong: HeroCookAlong | null;
}) {
  const { t } = useTranslation();
  const photo = usePhotoColors();
  const { colors } = useThemePreference();

  const backButton = (variant: 'photo' | 'tile') =>
    onBack ? (
      <IconButton variant={variant} icon="arrow-back" label={t('common.back')} trackId="recipe.back" onPress={onBack} />
    ) : null;

  if (imageUrl) {
    const height = immersive ? 380 + topInset : 260;
    const bottomGap = immersive ? HERO_OVERLAP + 16 : 16;
    const ownActions = actions('photo');
    return (
      <PhotoTile
        src={imageUrl}
        fade="none"
        onPhotoError={onPhotoError}
        style={immersive ? { height, borderRadius: 0 } : { height }}
      >
        {/* Everything on the photo brings its own scrim backing, so it reads over any photo. */}
        <View
          pointerEvents="box-none"
          style={{ position: 'absolute', top: 0, bottom: 0, start: 0, end: 0 }}
        >
          {backButton('photo') || ownActions ? (
            <View
              pointerEvents="box-none"
              style={{
                position: 'absolute',
                top: (immersive ? topInset : 0) + 12,
                start: 16,
                end: 16,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 8,
              }}
            >
              {backButton('photo')}
              <View style={{ flex: 1 }} />
              {ownActions}
            </View>
          ) : null}
          {cookAlong ? (
            <View
              pointerEvents="box-none"
              style={{ position: 'absolute', start: 16, end: 16, bottom: bottomGap, paddingEnd: aiGenerated ? 56 : 0 }}
            >
              <Pressable
                trackId="recipe.video.play"
                onPress={cookAlong.onPress}
                accessibilityRole="button"
                accessibilityLabel={cookAlong.accessibilityLabel}
                style={({ pressed }) => ({
                  alignSelf: 'flex-start',
                  maxWidth: '100%',
                  minHeight: MIN_TOUCH + 8,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 10,
                  paddingStart: 8,
                  paddingEnd: 16,
                  paddingVertical: 6,
                  borderRadius: Radii.inner,
                  backgroundColor: withAlpha(photo.scrim, pressed ? 0.8 : 0.62),
                })}
              >
                <View
                  style={{
                    width: 36,
                    height: 36,
                    borderRadius: 18,
                    alignItems: 'center',
                    justifyContent: 'center',
                    backgroundColor: photo.scrimPrimary,
                  }}
                >
                  <KitIcon icon="play" size={16} color={photo.onScrimPrimary} />
                </View>
                <View style={{ flexShrink: 1, minWidth: 0 }}>
                  <Text tone="onScrim" variant="bodySmall" weight="semibold" numberOfLines={1}>
                    {t('web.library.cookAlongVideo')}
                  </Text>
                  <Text tone="onScrimMuted" variant="caption" numberOfLines={1}>
                    {cookAlong.hint}
                  </Text>
                </View>
              </Pressable>
            </View>
          ) : null}
          {aiGenerated ? (
            <View
              testID="ai-image-mark"
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('recipe.aiImage')}
              style={{
                position: 'absolute',
                end: 16,
                bottom: bottomGap + 8,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                paddingHorizontal: 10,
                paddingVertical: 6,
                borderRadius: Radii.pill,
                backgroundColor: withAlpha(photo.scrim, 0.62),
              }}
            >
              <KitIcon icon="sparkles" size={13} color={photo.onScrim} />
            </View>
          ) : null}
        </View>
      </PhotoTile>
    );
  }

  const ownActions = actions('tile');
  const row =
    backButton('tile') || ownActions ? (
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 8,
          paddingHorizontal: immersive ? 16 : 0,
          paddingTop: immersive ? topInset + 12 : 0,
        }}
      >
        {backButton('tile')}
        <View style={{ flex: 1 }} />
        {ownActions}
      </View>
    ) : null;

  if (drawingPicture) {
    return (
      <View style={{ gap: 12 }}>
        {row}
        <View style={{ paddingHorizontal: immersive ? 16 : 0 }}>
          <Tile
            testID="drawing-picture"
            accessible
            accessibilityRole="progressbar"
            accessibilityLabel={t('recipe.drawingImage')}
            style={{ height: 200, alignItems: 'center', justifyContent: 'center', gap: 10 }}
          >
            <ActivityIndicator color={colors.primary} />
            <Text variant="caption" tone="muted">
              {t('recipe.drawingImage')}
            </Text>
          </Tile>
        </View>
      </View>
    );
  }

  return row;
}
