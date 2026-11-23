import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { SelectRecipesList } from '@/components/SelectRecipesList';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { HAIRLINE } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { translateAppError } from '@shared/lib/translateAppError';
import type { RecipeCollection } from '@shared/types/collection';
import type { Recipe } from '@shared/types/recipe';

interface SelectRecipesForShoppingListModalProps {
  visible: boolean;
  recipes: Recipe[];
  collections: RecipeCollection[];
  onClose: () => void;
  onConfirm: (selectedIds: string[]) => Promise<void>;
}

/**
 * Multi-select recipes (search + collection filter) to assemble a shopping list.
 */
export function SelectRecipesForShoppingListModal({
  visible,
  recipes,
  collections,
  onClose,
  onConfirm,
}: SelectRecipesForShoppingListModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelectedIds([]);
    setError(null);
    setSaving(false);
  }, [visible]);

  const selectedCount = selectedIds.length;

  async function handleConfirm() {
    if (selectedCount === 0) {
      setError(t('list.pickRecipes'));
      announce(t('list.pickRecipes'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm(selectedIds);
      onClose();
    } catch (err) {
      const message = translateAppError(err, t, 'list.fromRecipesFailed');
      setError(message);
      announce(message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      trackId="shopping_list_from_recipes.sheet"
      visible={visible}
      onClose={onClose}
      title={t('list.fromRecipesTitle')}
      maxWidth={560}
      footer={
        <View
          style={{
            gap: 10,
            paddingHorizontal: 20,
            paddingVertical: 16,
            borderTopWidth: HAIRLINE,
            borderColor: colors.border,
          }}
        >
          {error ? (
            <Text variant="bodySmall" tone="danger">
              {error}
            </Text>
          ) : null}
          <Button
            trackId="shopping_list_from_recipes.confirm"
            size="lg"
            fullWidth
            busy={saving}
            disabled={selectedCount === 0}
            onPress={() => void handleConfirm()}
          >
            {selectedCount === 1
              ? t('list.addRecipesOne', { count: selectedCount })
              : t('list.addRecipesOther', { count: selectedCount })}
          </Button>
        </View>
      }
    >
      <View style={{ flex: 1, paddingHorizontal: 20 }}>
        <SelectRecipesList
          recipes={recipes}
          collections={collections}
          selectedIds={selectedIds}
          onChangeSelectedIds={setSelectedIds}
          hint={t('list.fromRecipesHint')}
        />
      </View>
    </SheetModal>
  );
}
