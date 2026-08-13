import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { SheetModal } from '@/components/SheetModal';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { resolveCulinaryLanguage } from '@/lib/culinaryUnits';
import { displayIngredientAmount } from '@/lib/displayIngredientAmount';
import { RecipeLanguageCode } from '@/lib/recipeLanguages';
import { Ingredient } from '@/types/recipe';

interface AddToShoppingListModalProps {
  visible: boolean;
  ingredients: Ingredient[];
  language?: RecipeLanguageCode | null;
  onClose: () => void;
  onConfirm: (selected: Ingredient[]) => Promise<void>;
}

/**
 * Lets the user pick which scaled ingredients to merge into the shopping list.
 * All ingredients start selected.
 */
export function AddToShoppingListModal({
  visible,
  ingredients,
  language = null,
  onClose,
  onConfirm,
}: AddToShoppingListModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { language: appLanguage } = useLanguagePreference();
  const { system: measurementSystem } = useMeasurementPreference();
  const unitLanguage = resolveCulinaryLanguage(language, appLanguage);
  const [selected, setSelected] = useState<Set<number>>(() => new Set());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    setSelected(new Set(ingredients.map((_, index) => index)));
    setError(null);
    setSaving(false);
  }, [visible, ingredients]);

  const selectedCount = selected.size;
  const allSelected = useMemo(
    () => ingredients.length > 0 && selectedCount === ingredients.length,
    [ingredients.length, selectedCount],
  );

  function toggleIndex(index: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(index)) next.delete(index);
      else next.add(index);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) {
      setSelected(new Set());
    } else {
      setSelected(new Set(ingredients.map((_, index) => index)));
    }
  }

  async function handleConfirm() {
    const picked = ingredients.filter((_, index) => selected.has(index));
    if (picked.length === 0) {
      setError(t('addToList.pickOne'));
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm(picked);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('addToList.failed'));
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={onClose}
      title={t('addToList.title')}
      maxWidth={520}
      footer={
        <View className="border-t px-5 py-4" style={{ borderColor: colors.border }}>
          <Pressable
            className="items-center rounded-full py-3.5 active:opacity-80"
            style={{
              backgroundColor: colors.primary,
              opacity: saving || selectedCount === 0 ? 0.7 : 1,
            }}
            disabled={saving || selectedCount === 0}
            onPress={() => void handleConfirm()}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-sm font-bold text-white">
                {t(selectedCount === 1 ? 'addToList.addOne' : 'addToList.addOther', {
                  count: selectedCount,
                })}
              </Text>
            )}
          </Pressable>
        </View>
      }
    >
      <View className="flex-row items-center justify-between px-5 pb-3">
        <Text className="text-sm" style={{ color: colors.textSecondary }}>
          {t('addToList.selected', { selected: selectedCount, total: ingredients.length })}
        </Text>
        <Pressable
          onPress={toggleAll}
          className="active:opacity-70"
          accessibilityRole="button"
          accessibilityState={{ selected: allSelected }}
        >
          <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
            {t(allSelected ? 'addToList.deselectAll' : 'addToList.selectAll')}
          </Text>
        </Pressable>
      </View>

      <ScrollView className="flex-1 px-5" showsVerticalScrollIndicator={false}>
        <View
          className="mb-4 rounded-3xl border px-4"
          style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        >
          {ingredients.map((ing, index) => {
            const isOn = selected.has(index);
            return (
              <Pressable
                key={`${ing.name}-${index}`}
                className={`flex-row items-center gap-3 py-3.5 active:opacity-80 ${
                  index < ingredients.length - 1 ? 'border-b' : ''
                }`}
                style={
                  index < ingredients.length - 1
                    ? { borderColor: colors.primarySoft }
                    : undefined
                }
                onPress={() => toggleIndex(index)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: isOn }}
                accessibilityLabel={t('addToList.ingredientLabel', { name: ing.name })}
              >
                <View
                  className="h-6 w-6 items-center justify-center rounded-md border-2"
                  style={{
                    borderColor: isOn ? colors.primary : colors.textSecondary,
                    backgroundColor: isOn ? colors.primary : 'transparent',
                  }}
                >
                  {isOn ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
                </View>
                <Text
                  className="flex-1 text-base font-medium"
                  style={{ color: colors.text, paddingEnd: 8 }}
                >
                  {ing.name}
                </Text>
                <Text className="text-sm tabular-nums" style={{ color: colors.textSecondary }}>
                  {displayIngredientAmount(ing.quantity, ing.unit, {
                    system: measurementSystem,
                    language: unitLanguage,
                  })}
                </Text>
              </Pressable>
            );
          })}
        </View>

        {error ? (
          <View
            className="mb-4 rounded-2xl border px-4 py-3"
            style={{ borderColor: colors.dangerSoft, backgroundColor: colors.dangerSoft }}
          >
            <Text className="text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          </View>
        ) : null}
      </ScrollView>
    </SheetModal>
  );
}
