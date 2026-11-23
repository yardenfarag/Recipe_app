import { useTranslation } from 'react-i18next';
import { Modal, Platform } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, Radii, type IconName } from '@/components/ui/tokens';
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
          backgroundColor: colors.overlay,
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
          style={{
            padding: 8,
            borderRadius: Radii.tile,
            borderWidth: HAIRLINE,
            backgroundColor: colors.surface,
            borderColor: colors.border,
            width: isWeb ? '100%' : undefined,
            maxWidth: isWeb ? 400 : undefined,
            marginHorizontal: isWeb ? 0 : 12,
            marginBottom: isWeb ? 0 : Math.max(insets.bottom, 16),
          }}
        >
          <TileLabel
            numberOfLines={1}
            accessibilityRole="header"
            style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}
          >
            {recipeTitle}
          </TileLabel>

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

          <Button
            variant="outline"
            fullWidth
            trackId="recipe_actions.cancel"
            accessibilityLabel={t('common.cancel')}
            onPress={onClose}
            style={{ marginTop: 8 }}
          >
            {t('common.cancel')}
          </Button>
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
  icon: IconName;
  label: string;
  color: string;
  iconColor: string;
  onPress: () => void;
  trackId: string;
}) {
  const { colors } = useThemePreference();
  const pressedColor = colors.backgroundElement;
  return (
    <Pressable trackId={trackId}
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        minHeight: 52,
        flexDirection: 'row',
        alignItems: 'center',
        gap: 14,
        paddingHorizontal: 12,
        borderRadius: Radii.inner,
        backgroundColor: pressed ? pressedColor : 'transparent',
      })}
    >
      <KitIcon icon={icon} size={20} color={iconColor} />
      <Text variant="body" weight="medium" color={color} style={{ flex: 1, minWidth: 0 }}>
        {label}
      </Text>
    </Pressable>
  );
}
