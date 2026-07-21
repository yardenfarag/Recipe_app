import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useThemePreference } from '@/hooks/useThemePreference';
import { formatQuantity } from '@/lib/formatQuantity';
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
  const { colors } = useThemePreference();
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
      setError('Pick at least one ingredient.');
      return;
    }

    setSaving(true);
    setError(null);
    try {
      await onConfirm(picked);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add to list.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
        <View className="flex-row items-center justify-between px-5 pb-2 pt-4">
          <Pressable
            onPress={onClose}
            accessibilityRole="button"
            accessibilityLabel="Close"
            className="h-10 w-10 items-center justify-center rounded-full active:opacity-70"
            style={{ backgroundColor: colors.primarySoft }}
          >
            <Ionicons name="close" size={20} color={colors.text} />
          </Pressable>
          <Text className="text-base font-bold" style={{ color: colors.text }}>
            Add to list
          </Text>
          <View style={{ width: 40 }} />
        </View>

        <View className="flex-row items-center justify-between px-5 pb-3">
          <Text className="text-sm" style={{ color: colors.textSecondary }}>
            {selectedCount} of {ingredients.length} selected
          </Text>
          <Pressable onPress={toggleAll} className="active:opacity-70">
            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
              {allSelected ? 'Deselect all' : 'Select all'}
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
                    className="flex-1 pr-2 text-base font-medium"
                    style={{ color: colors.text }}
                  >
                    {ing.name}
                  </Text>
                  <Text className="text-sm tabular-nums" style={{ color: colors.textSecondary }}>
                    {formatQuantity(ing.quantity, ing.unit, language)}
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
                Add {selectedCount} item{selectedCount === 1 ? '' : 's'}
              </Text>
            )}
          </Pressable>
        </View>
      </SafeAreaView>
    </Modal>
  );
}
