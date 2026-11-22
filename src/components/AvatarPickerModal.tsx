import Ionicons from '@expo/vector-icons/Ionicons';
import { ActivityIndicator, Platform, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { FOOD_AVATAR_IDS, foodAvatarIdFrom, type FoodAvatarId } from '@shared/lib/foodAvatars';

import { FoodAvatarArt } from '@/components/ProfileAvatar';
import { SheetModal } from '@/components/SheetModal';
import { Pressable } from '@/components/ui/Pressable';
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
  const selected = foodAvatarIdFrom(current);
  const isWeb = Platform.OS === 'web';

  const photoButton = (source: 'camera' | 'library', icon: keyof typeof Ionicons.glyphMap, label: string) => (
    <Pressable
      trackId={`settings.avatar.${source}`}
      onPress={() => onPhoto(source)}
      disabled={busy != null}
      accessibilityRole="button"
      accessibilityState={{ disabled: busy != null, busy: busy === source }}
      className="min-h-11 flex-1 flex-row items-center justify-center gap-2 rounded-[18px] px-4 active:opacity-70"
      style={{ backgroundColor: colors.primarySoft, opacity: busy != null && busy !== source ? 0.5 : 1 }}
    >
      {busy === source ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons name={icon} size={18} color={colors.primary} />
      )}
      <Text className="text-sm font-semibold" style={{ color: colors.text }}>
        {label}
      </Text>
    </Pressable>
  );

  return (
    <SheetModal
      visible={visible}
      onClose={() => busy == null && onClose()}
      title={t('settings.changeAvatarTitle')}
      trackId="settings.avatar_picker"
      maxWidth={440}
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 24 }}>
        <Text className="mb-4 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('settings.foodAvatarsHint')}
        </Text>
        <View
          className="flex-row flex-wrap justify-center"
          style={{ gap: 14 }}
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
                className="items-center justify-center rounded-full active:opacity-70"
                style={{
                  width: TILE + 8,
                  height: TILE + 8,
                  borderWidth: 3,
                  borderColor: isSelected ? colors.primary : 'transparent',
                  opacity: busy != null && !isSaving ? 0.5 : 1,
                }}
              >
                <View className="overflow-hidden rounded-full" style={{ width: TILE, height: TILE }}>
                  <FoodAvatarArt id={id} size={TILE} />
                  {/* Over the drawing's own colours, so the same dim and white spinner in every theme. */}
                  {isSaving ? (
                    <View
                      className="absolute inset-0 items-center justify-center"
                      style={{ backgroundColor: 'rgba(0, 0, 0, 0.35)' }}
                    >
                      <ActivityIndicator size="small" color="#FFFFFF" />
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <View className="mt-6 flex-row gap-3">
          {isWeb ? null : photoButton('camera', 'camera-outline', t('settings.takePhoto'))}
          {photoButton('library', 'image-outline', isWeb ? t('settings.uploadPhoto') : t('settings.chooseLibrary'))}
        </View>
      </ScrollView>
    </SheetModal>
  );
}
