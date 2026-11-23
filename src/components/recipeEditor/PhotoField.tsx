import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Radii, usePhotoColors, withAlpha } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { pickCompressedRecipeImage } from '@/lib/pickCompressedImage';
import type { EditorPhoto } from '@shared/lib/recipeEditor';
import { recipeImageSource } from '@/lib/recipeImageSource';

type PhotoFieldProps = {
  photo: EditorPhoto;
  /** The saved photo, shown while `photo` is keep. */
  imageUrl: string | null;
  /** The saved picture is one Pinch drew. */
  generated: boolean;
  /** Pinch is still drawing the picture an earlier save asked for. */
  drawing: boolean;
  onChange: (photo: EditorPhoto) => void;
};

/**
 * Replace or add a photo from the camera or library, or remove it. A photo of the dish comes first; the owner can
 * also ask Pinch to draw a picture, which happens after the save (PIN-169). Pinch never draws one unasked.
 */
export function PhotoField({ photo, imageUrl, generated, drawing, onChange }: PhotoFieldProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const onPhoto = usePhotoColors();

  const source =
    photo.kind === 'replace'
      ? { uri: `data:${photo.mimeType};base64,${photo.base64}` }
      : photo.kind === 'keep' && imageUrl
        ? recipeImageSource(imageUrl)
        : null;
  const showsDrawing = photo.kind === 'keep' && Boolean(imageUrl) && generated;

  async function pick(from: 'camera' | 'library') {
    const image = await pickCompressedRecipeImage(from, {
      permissionTitle: t('settings.permissionNeededTitle'),
      permissionCamera: t('settings.permissionCamera'),
      permissionLibrary: t('settings.permissionLibrary'),
      readFailedTitle: t('settings.imageReadFailedTitle'),
      readFailedBody: t('snap.photoTooLarge'),
    });
    if (image) onChange({ kind: 'replace', base64: image.base64, mimeType: image.mimeType });
  }

  function choose() {
    if (Platform.OS === 'web') {
      void pick('library');
      return;
    }
    Alert.alert(source ? t('recipeEditor.photo.replace') : t('recipeEditor.photo.add'), undefined, [
      { text: t('recipeEditor.photo.camera'), onPress: () => void pick('camera') },
      { text: t('recipeEditor.photo.library'), onPress: () => void pick('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  const addButton = (
    <Button
      variant="secondary"
      size="sm"
      icon={source ? 'image-outline' : 'camera-outline'}
      trackId={source ? 'recipe_editor.photo.replace' : 'recipe_editor.photo.add'}
      onPress={choose}
    >
      {source ? t('recipeEditor.photo.replace') : t('recipeEditor.photo.add')}
    </Button>
  );

  const drawButton = (label: string, trackId: string) => (
    <Button variant="outline" size="sm" icon="sparkles" trackId={trackId} onPress={() => onChange({ kind: 'generate' })}>
      {label}
    </Button>
  );

  if (photo.kind === 'generate') {
    return (
      <View style={{ gap: 10 }}>
        <View
          style={{
            width: '100%',
            aspectRatio: 16 / 9,
            borderRadius: Radii.inner,
            alignItems: 'center',
            justifyContent: 'center',
            gap: 8,
            paddingHorizontal: 20,
            backgroundColor: colors.primarySoft,
          }}
        >
          <Ionicons name="sparkles" size={24} color={colors.primaryText} />
          <Text weight="semibold" align="center" accessibilityLiveRegion="polite">
            {t('recipeEditor.photo.willDraw')}
          </Text>
        </View>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {addButton}
          <Button variant="outline" size="sm" trackId="recipe_editor.photo.dont_draw" onPress={() => onChange({ kind: 'keep' })}>
            {t('recipeEditor.photo.dontDraw')}
          </Button>
        </View>
      </View>
    );
  }

  return (
    <View style={{ gap: 10 }}>
      {source ? (
        <View>
          <Image
            source={source}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: Radii.inner, backgroundColor: colors.primarySoft }}
          />
          {showsDrawing ? (
            // Over a picture, so the same in light and dark (RecipeImage's mark).
            <View
              testID="ai-image-mark"
              style={{
                position: 'absolute',
                top: 10,
                start: 10,
                flexDirection: 'row',
                alignItems: 'center',
                gap: 4,
                borderRadius: 8,
                paddingHorizontal: 10,
                paddingVertical: 5,
                backgroundColor: withAlpha(onPhoto.scrim, 0.7),
              }}
            >
              <Ionicons name="sparkles" size={12} color={onPhoto.onScrim} />
              <Text variant="caption" weight="semibold" tone="onScrim">
                {t('recipe.aiImage')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text variant="bodySmall" tone="muted">
          {t('recipeEditor.photo.ownBest')}
        </Text>
      )}
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {addButton}
        {source ? null : drawing ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ minHeight: 44, flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 8 }}
          >
            <ActivityIndicator size="small" color={colors.primary} />
            <Text variant="bodySmall" tone="muted">
              {t('recipe.drawingImage')}
            </Text>
          </View>
        ) : (
          drawButton(t('recipeEditor.photo.draw'), 'recipe_editor.photo.draw')
        )}
        {showsDrawing ? drawButton(t('recipeEditor.photo.drawAgain'), 'recipe_editor.photo.draw_again') : null}
        {source ? (
          <Button
            variant="ghost"
            size="sm"
            icon="trash-outline"
            trackId="recipe_editor.photo.remove"
            onPress={() => onChange(imageUrl ? { kind: 'remove' } : { kind: 'keep' })}
          >
            {t('recipeEditor.photo.remove')}
          </Button>
        ) : null}
      </View>
    </View>
  );
}
