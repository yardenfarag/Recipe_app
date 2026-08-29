import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { SelectRecipesList } from '@/components/SelectRecipesList';
import { SheetModal } from '@/components/SheetModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { translateAppError } from '@/lib/translateAppError';
import type { RecipeCollection } from '@/types/collection';
import type { Recipe } from '@/types/recipe';

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
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm(selectedIds);
      onClose();
    } catch (err) {
      setError(translateAppError(err, t, 'list.fromRecipesFailed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('list.fromRecipesTitle')}
      maxWidth={560}
      footer={
        <View className="border-t px-5 py-4" style={{ borderColor: colors.border }}>
          {error ? (
            <Text className="mb-3 text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}
          <Pressable
            className="items-center justify-center rounded-2xl py-3.5 active:opacity-80"
            style={{
              backgroundColor: colors.primary,
              opacity: saving || selectedCount === 0 ? 0.55 : 1,
            }}
            disabled={saving || selectedCount === 0}
            onPress={() => void handleConfirm()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-bold text-white">
                {selectedCount === 1
                  ? t('list.addRecipesOne', { count: selectedCount })
                  : t('list.addRecipesOther', { count: selectedCount })}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View className="flex-1 px-5">
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
