import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { ActivityIndicator, Alert, Platform, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useTranslation } from 'react-i18next';

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
    <Pressable trackId={source ? 'recipe_editor.photo.replace' : 'recipe_editor.photo.add'}
      onPress={choose}
      accessibilityRole="button"
      className="min-h-[44px] flex-row items-center justify-center rounded-2xl px-4 active:opacity-80"
      style={{ backgroundColor: colors.primarySoft }}
    >
      <Text className="text-sm font-semibold" style={{ color: colors.text }}>
        {source ? t('recipeEditor.photo.replace') : t('recipeEditor.photo.add')}
      </Text>
    </Pressable>
  );

  const drawButton = (label: string, trackId: string) => (
    <Pressable trackId={trackId}
      onPress={() => onChange({ kind: 'generate' })}
      accessibilityRole="button"
      className="min-h-[44px] flex-row items-center justify-center gap-1.5 rounded-2xl border px-4 active:opacity-80"
      style={{ borderColor: colors.border }}
    >
      <Ionicons name="sparkles" size={14} color={colors.primary} />
      <Text className="text-sm font-semibold" style={{ color: colors.text }}>
        {label}
      </Text>
    </Pressable>
  );

  if (photo.kind === 'generate') {
    return (
      <View className="gap-2">
        <View
          className="items-center justify-center gap-2 px-5"
          style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: colors.primarySoft }}
        >
          <Ionicons name="sparkles" size={24} color={colors.primary} />
          <Text accessibilityLiveRegion="polite" className="text-center text-base font-semibold" style={{ color: colors.text }}>
            {t('recipeEditor.photo.willDraw')}
          </Text>
        </View>
        <View className="flex-row flex-wrap gap-2">
          {addButton}
          <Pressable trackId="recipe_editor.photo.dont_draw"
            onPress={() => onChange({ kind: 'keep' })}
            accessibilityRole="button"
            className="min-h-[44px] flex-row items-center justify-center rounded-2xl border px-4 active:opacity-80"
            style={{ borderColor: colors.border }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              {t('recipeEditor.photo.dontDraw')}
            </Text>
          </Pressable>
        </View>
      </View>
    );
  }

  return (
    <View className="gap-2">
      {source ? (
        <View>
          <Image
            source={source}
            contentFit="cover"
            accessibilityIgnoresInvertColors
            style={{ width: '100%', aspectRatio: 16 / 9, borderRadius: 18, backgroundColor: colors.primarySoft }}
          />
          {showsDrawing ? (
            // Over a picture, so the same in light and dark (RecipeImage's mark).
            <View
              testID="ai-image-mark"
              className="absolute start-2.5 top-2.5 flex-row items-center gap-1 rounded-full px-2.5 py-1"
              style={{ backgroundColor: 'rgba(0,0,0,0.55)' }}
            >
              <Ionicons name="sparkles" size={12} color="#fff" />
              <Text className="text-xs font-semibold" style={{ color: '#fff' }}>
                {t('recipe.aiImage')}
              </Text>
            </View>
          ) : null}
        </View>
      ) : (
        <Text className="text-sm" style={{ color: colors.textSecondary }}>
          {t('recipeEditor.photo.ownBest')}
        </Text>
      )}
      <View className="flex-row flex-wrap gap-2">
        {addButton}
        {source ? null : drawing ? (
          <View accessibilityLiveRegion="polite" className="min-h-[44px] flex-row items-center gap-2 px-2">
            <ActivityIndicator size="small" color={colors.primary} />
            <Text className="text-sm" style={{ color: colors.textSecondary }}>
              {t('recipe.drawingImage')}
            </Text>
          </View>
        ) : (
          drawButton(t('recipeEditor.photo.draw'), 'recipe_editor.photo.draw')
        )}
        {showsDrawing ? drawButton(t('recipeEditor.photo.drawAgain'), 'recipe_editor.photo.draw_again') : null}
        {source ? (
          <Pressable trackId="recipe_editor.photo.remove"
            onPress={() => onChange(imageUrl ? { kind: 'remove' } : { kind: 'keep' })}
            accessibilityRole="button"
            className="min-h-[44px] flex-row items-center justify-center rounded-2xl border px-4 active:opacity-80"
            style={{ borderColor: colors.border }}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.danger }}>
              {t('recipeEditor.photo.remove')}
            </Text>
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}
