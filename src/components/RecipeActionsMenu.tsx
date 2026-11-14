import Ionicons from '@expo/vector-icons/Ionicons';
import { useTranslation } from 'react-i18next';
import { Modal, Platform, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';

interface RecipeActionsMenuProps {
  visible: boolean;
  recipeTitle: string;
  onClose: () => void;
  onAddToCollection: () => void;
  /** Opens Edit recipe (ADR 018). Left out, the row is hidden. */
  onEdit?: () => void;
  onRename: () => void;
  onDelete: () => void;
}

/** Overflow menu for a library recipe row (⋯). */
export function RecipeActionsMenu({
  visible,
  recipeTitle,
  onClose,
  onAddToCollection,
  onEdit,
  onRename,
  onDelete,
}: RecipeActionsMenuProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { rtl } = useRtl();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable trackId="recipe_actions.backdrop"
        className={isWeb ? 'flex-1 items-center justify-center px-4' : 'flex-1 justify-end'}
        style={{
          backgroundColor: 'rgba(20, 16, 28, 0.48)',
          direction: rtl ? 'rtl' : 'ltr',
        }}
        onPress={onClose}
        accessible={false}
      >
        <Pressable trackId="recipe_actions.panel"
          onPress={(e) => e.stopPropagation?.()}
          accessible={false}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          className="rounded-3xl border px-2 py-2"
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
            accessibilityRole="header"
          >
            {recipeTitle}
          </Text>

          <MenuRow
            icon="folder-outline"
            label={t('library.addToCollection')}
            color={colors.text}
            iconColor={colors.primary}
            onPress={onAddToCollection}
            trackId="recipe_actions.add_to_collection"
          />
          {onEdit ? (
            <MenuRow
              icon="create-outline"
              label={t('recipeEditor.titleEdit')}
              color={colors.text}
              iconColor={colors.primary}
              onPress={onEdit}
              trackId="recipe_actions.edit"
            />
          ) : null}
          <MenuRow
            icon="pencil-outline"
            label={t('library.rename')}
            color={colors.text}
            iconColor={colors.primary}
            onPress={onRename}
            trackId="recipe_actions.rename"
          />
          <MenuRow
            icon="trash-outline"
            label={t('common.delete')}
            color={colors.danger}
            iconColor={colors.danger}
            onPress={onDelete}
            trackId="recipe_actions.delete"
          />

          <Pressable trackId="recipe_actions.cancel"
            onPress={onClose}
            className="mt-1 min-h-[48px] items-center justify-center rounded-3xl active:opacity-80"
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
  trackId,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  color: string;
  iconColor: string;
  onPress: () => void;
  trackId: string;
}) {
  return (
    <Pressable trackId={trackId}
      onPress={onPress}
      className="min-h-[52px] flex-row items-center gap-3 rounded-3xl px-3 active:opacity-80"
      accessibilityRole="button"
      accessibilityLabel={label}
    >
      <Ionicons name={icon} size={20} color={iconColor} />
      <Text className="min-w-0 flex-1 text-[15px] font-semibold" style={{ color }}>
        {label}
      </Text>
    </Pressable>
  );
}
