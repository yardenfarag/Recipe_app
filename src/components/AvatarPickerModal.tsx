import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FOOD_AVATAR_IDS, foodAvatarIdFrom, type FoodAvatarId } from '@shared/lib/foodAvatars';

import { FoodAvatarArt } from '@/components/ProfileAvatar';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { usePhotoColors, withAlpha, type IconName } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

const TILE = 68;

type Props = {
  visible: boolean;
  onClose: () => void;
  /** The current `avatar_url`. */
  current: string | null;
  /** What is being saved: a food avatar, a photo from the camera or library, or nothing. */
  busy: FoodAvatarId | 'camera' | 'library' | null;
  onPick: (id: FoodAvatarId) => void;
  onPhoto: (source: 'camera' | 'library') => void;
};

/** Choose a profile picture: tap a food friend and it's saved at once, or use a photo instead. */
export function AvatarPickerModal({ visible, onClose, current, busy, onPick, onPhoto }: Props) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const photo = usePhotoColors();
  const selected = foodAvatarIdFrom(current);
  const isWeb = Platform.OS === 'web';

  const photoButton = (source: 'camera' | 'library', icon: IconName, label: string) => (
    <Button
      trackId={`settings.avatar.${source}`}
      variant="secondary"
      icon={icon}
      busy={busy === source}
      disabled={busy != null && busy !== source}
      onPress={() => onPhoto(source)}
      style={{ flex: 1 }}
    >
      {label}
    </Button>
  );

  return (
    <SheetModal
      visible={visible}
      onClose={() => busy == null && onClose()}
      title={t('settings.changeAvatarTitle')}
      trackId="settings.avatar_picker"
      maxWidth={440}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24, gap: 20 }}>
        <Text variant="bodySmall" tone="muted" align="center">
          {t('settings.foodAvatarsHint')}
        </Text>
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'center', gap: 12 }}
          accessibilityLabel={t('settings.foodAvatarPick')}
        >
          {FOOD_AVATAR_IDS.map((id) => {
            const isSelected = selected === id;
            const isSaving = busy === id;
            return (
              <Pressable
                key={id}
                trackId={`settings.avatar.food.${id}`}
                onPress={() => onPick(id)}
                disabled={busy != null}
                accessibilityRole="button"
                accessibilityLabel={t(`settings.foodAvatarNames.${id}`)}
                accessibilityState={{ selected: isSelected, disabled: busy != null, busy: isSaving }}
                style={({ pressed }) => ({
                  width: TILE + 10,
                  height: TILE + 10,
                  alignItems: 'center',
                  justifyContent: 'center',
                  borderRadius: (TILE + 10) / 2,
                  borderWidth: 3,
                  borderColor: isSelected ? colors.primary : 'transparent',
                  opacity: busy != null && !isSaving ? 0.5 : pressed ? 0.8 : 1,
                })}
              >
                <View style={{ width: TILE, height: TILE, borderRadius: TILE / 2, overflow: 'hidden' }}>
                  <FoodAvatarArt id={id} size={TILE} />
                  {/* Over the drawing's own colours, so the same dim and spinner in every theme. */}
                  {isSaving ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: 0,
                        bottom: 0,
                        start: 0,
                        end: 0,
                        alignItems: 'center',
                        justifyContent: 'center',
                        backgroundColor: withAlpha(photo.scrim, 0.45),
                      }}
                    >
                      <ActivityIndicator size="small" color={photo.onScrim} />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View style={{ flexDirection: 'row', gap: 12 }}>
          {isWeb ? null : photoButton('camera', 'camera-outline', t('settings.takePhoto'))}
          {photoButton('library', 'image-outline', isWeb ? t('settings.uploadPhoto') : t('settings.chooseLibrary'))}
        </View>
      </ScrollView>
    </SheetModal>
  );
}
