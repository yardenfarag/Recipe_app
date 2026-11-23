import { useTranslation } from 'react-i18next';
import { Modal, Platform, ScrollView, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Button } from '@/components/ui/Button';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, Radii, type IconName } from '@/components/ui/tokens';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';

export type RecipeMenuItem = {
  key: string;
  icon: IconName;
  label: string;
  /** A second, muted line ("Uses 1 credit…"). */
  hint?: string;
  onPress: () => void;
  trackId: string;
  danger?: boolean;
  disabled?: boolean;
  /** Draws a hairline above the item, to start a group. */
  groupStart?: boolean;
};

/**
 * The recipe's "more" menu (PIN-177): a sheet from the bottom of the screen with the actions that don't have a
 * button of their own on the page (edit, collections, tags, the cook note, repair, revert, the original language,
 * discard). Choosing one closes the sheet first, then runs it, so a dialog it opens can present on iOS.
 */
export function RecipeMoreMenu({
  visible,
  title,
  items,
  onClose,
}: {
  visible: boolean;
  /** The recipe's name, at the top of the sheet. */
  title: string;
  items: RecipeMenuItem[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { rtl } = useRtl();
  const insets = useSafeAreaInsets();
  const isWeb = Platform.OS === 'web';

  function choose(item: RecipeMenuItem) {
    onClose();
    // iOS can't present a second modal while this one is still closing.
    setTimeout(item.onPress, Platform.OS === 'ios' ? 350 : 0);
  }

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        trackId="recipe.more.backdrop"
        onPress={onClose}
        accessible={false}
        style={{
          flex: 1,
          justifyContent: isWeb ? 'center' : 'flex-end',
          alignItems: isWeb ? 'center' : 'stretch',
          paddingHorizontal: isWeb ? 16 : 0,
          backgroundColor: colors.overlay,
          direction: rtl ? 'rtl' : 'ltr',
        }}
      >
        <Pressable
          trackId="recipe.more.panel"
          onPress={(event) => event.stopPropagation?.()}
          accessible={false}
          accessibilityViewIsModal
          onAccessibilityEscape={onClose}
          style={{
            width: isWeb ? '100%' : undefined,
            maxWidth: isWeb ? 420 : undefined,
            maxHeight: '85%',
            marginHorizontal: isWeb ? 0 : 12,
            marginBottom: isWeb ? 0 : Math.max(insets.bottom, 12),
            padding: 8,
            borderRadius: Radii.tile,
            borderWidth: HAIRLINE,
            borderColor: colors.border,
            backgroundColor: colors.surface,
          }}
        >
          <TileLabel numberOfLines={1} accessibilityRole="header" style={{ paddingHorizontal: 12, paddingTop: 10, paddingBottom: 6 }}>
            {title}
          </TileLabel>
          <ScrollView bounces={false} style={{ flexGrow: 0 }}>
            {items.map((item) => (
              <View key={item.key}>
                {item.groupStart ? (
                  <View style={{ height: HAIRLINE, backgroundColor: colors.border, marginVertical: 6, marginHorizontal: 12 }} />
                ) : null}
                <Pressable
                  trackId={item.trackId}
                  onPress={() => choose(item)}
                  disabled={item.disabled}
                  accessibilityRole="button"
                  accessibilityLabel={item.hint ? `${item.label}, ${item.hint}` : item.label}
                  accessibilityState={{ disabled: Boolean(item.disabled) }}
                  style={({ pressed }) => ({
                    minHeight: 52,
                    flexDirection: 'row',
                    alignItems: 'center',
                    gap: 14,
                    paddingHorizontal: 12,
                    paddingVertical: 8,
                    borderRadius: Radii.inner,
                    backgroundColor: pressed ? colors.backgroundElement : 'transparent',
                    opacity: item.disabled ? 0.5 : 1,
                  })}
                >
                  <KitIcon icon={item.icon} size={20} color={item.danger ? colors.danger : colors.textSecondary} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <Text variant="body" weight="medium" tone={item.danger ? 'danger' : 'default'}>
                      {item.label}
                    </Text>
                    {item.hint ? (
                      <Text variant="caption" tone="muted">
                        {item.hint}
                      </Text>
                    ) : null}
                  </View>
                </Pressable>
              </View>
            ))}
          </ScrollView>
          <Button
            variant="outline"
            fullWidth
            trackId="recipe.more.cancel"
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
