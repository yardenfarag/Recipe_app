import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Pressable, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';

interface RecipeActionsMenuProps {
  visible: boolean;
  recipeTitle: string;
  onClose: () => void;
  onAddToCollection: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/** Overflow menu for a library recipe row (⋯). */
export function RecipeActionsMenu({
  visible,
  recipeTitle,
  onClose,
  onAddToCollection,
  onRename,
  onDelete,
}: RecipeActionsMenuProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        className={isWeb ? 'flex-1 items-center justify-center px-4' : 'flex-1 justify-end'}
        style={{ backgroundColor: 'rgba(20, 16, 28, 0.48)' }}
        onPress={onClose}
      >
        <Pressable
          onPress={(e) => e.stopPropagation?.()}
          className="rounded-[28px] border px-2 py-2"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.frostedBorder,
            width: isWeb ? '100%' : undefined,
            maxWidth: isWeb ? 400 : undefined,
            marginHorizontal: isWeb ? 0 : 12,
            marginBottom: isWeb ? 0 : Math.max(insets.bottom, 16),
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 12 },
            shadowOpacity: isWeb ? 0.18 : 0,
            shadowRadius: 28,
          }}
        >
          <Text
            className="px-3 pb-2 pt-3 text-xs font-semibold uppercase tracking-wide"
            style={{ color: colors.textSecondary }}
            numberOfLines={1}
          >
            {recipeTitle}
          </Text>

          <MenuRow
            icon="folder-outline"
            label={t('library.addToCollection')}
            color={colors.text}
            iconColor={colors.primary}
            onPress={onAddToCollection}
          />
          <MenuRow
            icon="pencil-outline"
            label={t('library.rename')}
            color={colors.text}
            iconColor={colors.primary}
            onPress={onRename}
          />
          <MenuRow
            icon="trash-outline"
            label={t('common.delete')}
            color={colors.danger}
            iconColor={colors.danger}
            onPress={onDelete}
          />

          <Pressable
            onPress={onClose}
            className="mt-1 min-h-[48px] items-center justify-center rounded-[22px] active:opacity-80"
            style={{ backgroundColor: colors.primarySoft }}
            accessibilityRole="button"
            accessibilityLabel={t('common.cancel')}
          >
            <Text className="text-sm font-semibold" style={{ color: colors.text }}>
              {t('common.cancel')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function MenuRow({
  icon,
  label,
  color,
  iconColor,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  iconColor: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 rounded-[22px] px-3 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text className="text-[15px] font-semibold" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}
