import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/BrandHeader';
import { Screen } from '@/components/Screen';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { formatQuantity } from '@/lib/formatQuantity';
import {
  getDuplicateNameCounts,
  normalizeShoppingName,
} from '@/lib/shoppingListMerge';
import type { ShoppingListItem } from '@/types/shoppingList';

/** Alert.alert button actions are unreliable on web — use window.confirm there. */
function confirmDestructive(
  title: string,
  message: string,
  confirmLabel: string,
  onConfirm: () => void | Promise<void>,
) {
  if (Platform.OS === 'web') {
    const ok =
      typeof window !== 'undefined' && window.confirm(`${title}\n\n${message}`);
    if (ok) void onConfirm();
    return;
  }

  Alert.alert(title, message, [
    { text: 'Cancel', style: 'cancel' },
    {
      text: confirmLabel,
      style: 'destructive',
      onPress: () => {
        void onConfirm();
      },
    },
  ]);
}

export default function ShoppingListScreen() {
  const {
    items,
    loading,
    error,
    refresh,
    addManual,
    combineDuplicates,
    toggleChecked,
    updateItem,
    removeItem,
    clearChecked,
    clearAll,
  } = useShoppingList();
  const { colors } = useThemePreference();

  const [name, setName] = useState('');
  const [quantityText, setQuantityText] = useState('');
  const [unit, setUnit] = useState('');
  const [adding, setAdding] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [notice, setNotice] = useState<{
    message: string;
    combineName?: string;
  } | null>(null);

  const checkedCount = useMemo(() => items.filter((item) => item.checked).length, [items]);
  const duplicateCounts = useMemo(() => getDuplicateNameCounts(items), [items]);

  const typingDuplicateCount = useMemo(() => {
    const key = normalizeShoppingName(name);
    if (!key) return 0;
    return items.filter((item) => normalizeShoppingName(item.name) === key).length;
  }, [items, name]);

  const handleCombine = useCallback(
    async (duplicateName: string) => {
      try {
        await combineDuplicates(duplicateName);
        setNotice(null);
      } catch (err) {
        Alert.alert(
          'Could not combine',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    },
    [combineDuplicates],
  );

  const handleAdd = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert('Name required', 'Enter what you need to buy.');
      return;
    }

    let quantity: number | null = null;
    const qtyTrimmed = quantityText.trim();
    if (qtyTrimmed) {
      const parsed = Number(qtyTrimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert('Invalid amount', 'Quantity must be a positive number.');
        return;
      }
      quantity = parsed;
    }

    setAdding(true);
    try {
      const result = await addManual(
        trimmedName,
        quantity,
        unit.trim() ? unit.trim() : null,
      );
      setName('');
      setQuantityText('');
      setUnit('');

      if (result.alreadyOnList.length > 0) {
        const label = result.alreadyOnList[0];
        setNotice({
          message: `${label} was already on your list — kept as a separate line.`,
          combineName: label,
        });
      } else {
        setNotice(null);
      }
    } catch (err) {
      Alert.alert(
        'Could not add item',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setAdding(false);
    }
  }, [addManual, name, quantityText, unit]);

  const handleToggle = useCallback(
    async (item: ShoppingListItem) => {
      try {
        await toggleChecked(item.id);
      } catch (err) {
        Alert.alert(
          'Could not update',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    },
    [toggleChecked],
  );

  const handleRemove = useCallback(
    async (item: ShoppingListItem) => {
      try {
        await removeItem(item.id);
      } catch (err) {
        Alert.alert(
          'Could not remove',
          err instanceof Error ? err.message : 'Please try again.',
        );
      }
    },
    [removeItem],
  );

  const openEdit = useCallback((item: ShoppingListItem) => {
    setEditingItem(item);
    setEditName(item.name);
    setEditQuantity(item.quantity != null ? String(item.quantity) : '');
    setEditUnit(item.unit ?? '');
  }, []);

  const handleSaveEdit = useCallback(async () => {
    if (!editingItem) return;
    const trimmed = editName.trim();
    if (!trimmed) {
      Alert.alert('Name required', 'Enter an item name.');
      return;
    }

    let quantity: number | null = null;
    const raw = editQuantity.trim();
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert('Invalid amount', 'Quantity must be a positive number.');
        return;
      }
      quantity = parsed;
    }

    setSavingEdit(true);
    try {
      await updateItem(editingItem.id, {
        name: trimmed,
        quantity,
        unit: editUnit.trim() ? editUnit.trim() : null,
      });
      setEditingItem(null);
    } catch (err) {
      Alert.alert(
        'Could not update',
        err instanceof Error ? err.message : 'Please try again.',
      );
    } finally {
      setSavingEdit(false);
    }
  }, [editName, editQuantity, editUnit, editingItem, updateItem]);

  const handleLongPress = useCallback(
    (item: ShoppingListItem) => {
      const dupCount = duplicateCounts.get(normalizeShoppingName(item.name)) ?? 0;
      const buttons: {
        text: string;
        style?: 'cancel' | 'destructive';
        onPress?: () => void;
      }[] = [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Edit', onPress: () => openEdit(item) },
      ];

      if (dupCount > 1) {
        buttons.push({
          text: 'Combine duplicates',
          onPress: () => void handleCombine(item.name),
        });
      }

      buttons.push({
        text: 'Remove',
        style: 'destructive',
        onPress: () => handleRemove(item),
      });

      Alert.alert(item.name, undefined, buttons);
    },
    [duplicateCounts, handleCombine, handleRemove, openEdit],
  );

  const handleClearChecked = useCallback(() => {
    if (checkedCount === 0) return;
    confirmDestructive(
      'Clear checked items?',
      `${checkedCount} item${checkedCount === 1 ? '' : 's'} will be removed.`,
      'Clear checked',
      async () => {
        try {
          await clearChecked();
        } catch (err) {
          Alert.alert(
            'Could not clear',
            err instanceof Error ? err.message : 'Please try again.',
          );
        }
      },
    );
  }, [checkedCount, clearChecked]);

  const handleDeleteAll = useCallback(() => {
    if (items.length === 0) return;
    confirmDestructive(
      'Delete entire list?',
      `${items.length} item${items.length === 1 ? '' : 's'} will be permanently removed.`,
      'Delete all',
      async () => {
        try {
          await clearAll();
        } catch (err) {
          Alert.alert(
            'Could not delete list',
            err instanceof Error ? err.message : 'Please try again.',
          );
        }
      },
    );
  }, [clearAll, items.length]);

  const renderItem = useCallback(
    ({ item }: { item: ShoppingListItem }) => {
      const amount =
        item.quantity != null
          ? formatQuantity(item.quantity, item.unit ?? '')
          : item.unit
            ? item.unit
            : null;
      const dupCount = duplicateCounts.get(normalizeShoppingName(item.name)) ?? 0;
      const isDuplicate = dupCount > 1;

      return (
        <View
          className="mb-2 flex-row items-center gap-3 rounded-3xl border px-4 py-3.5"
          style={{
            backgroundColor: colors.surface,
            borderColor: isDuplicate ? colors.warning : colors.frostedBorder,
            borderLeftWidth: isDuplicate ? 3 : 1,
            borderLeftColor: isDuplicate ? colors.warning : colors.frostedBorder,
            opacity: item.checked ? 0.55 : 1,
          }}
        >
          <Pressable
            className="min-w-0 flex-1 flex-row items-center gap-3 active:opacity-90"
            onPress={() => void handleToggle(item)}
            onLongPress={() => handleLongPress(item)}
          >
            <View
              className="h-6 w-6 items-center justify-center rounded-md border-2"
              style={{
                borderColor: item.checked ? colors.primary : colors.textSecondary,
                backgroundColor: item.checked ? colors.primary : 'transparent',
              }}
            >
              {item.checked ? <Ionicons name="checkmark" size={14} color="#fff" /> : null}
            </View>
            <View className="min-w-0 flex-1">
              <View className="flex-row flex-wrap items-center gap-2">
                <Text
                  className="text-base font-semibold"
                  style={{
                    color: colors.text,
                    textDecorationLine: item.checked ? 'line-through' : 'none',
                  }}
                  numberOfLines={2}
                >
                  {item.name}
                </Text>
                {isDuplicate ? (
                  <Pressable
                    className="rounded-full px-2 py-0.5"
                    style={{ backgroundColor: colors.warningSoft }}
                    onPress={() => {
                      Alert.alert(
                        'Listed more than once',
                        `${item.name} appears ${dupCount} times. Combine matching amounts, or keep them separate.`,
                        [
                          { text: 'Keep separate', style: 'cancel' },
                          {
                            text: 'Combine',
                            onPress: () => void handleCombine(item.name),
                          },
                        ],
                      );
                    }}
                    hitSlop={6}
                  >
                    <Text className="text-[11px] font-bold" style={{ color: colors.warning }}>
                      Also listed · {dupCount}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              {amount ? (
                <Text className="mt-0.5 text-sm tabular-nums" style={{ color: colors.textSecondary }}>
                  {amount}
                </Text>
              ) : null}
            </View>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Edit ${item.name}`}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-70"
            hitSlop={8}
            onPress={() => openEdit(item)}
          >
            <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`Remove ${item.name}`}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-70"
            hitSlop={8}
            onPress={() => void handleRemove(item)}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      );
    },
    [colors, duplicateCounts, handleCombine, handleLongPress, handleRemove, handleToggle, openEdit],
  );

  if (loading && items.length === 0) {
    return (
      <Screen tabScreen className="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (error && items.length === 0) {
    return (
      <Screen tabScreen>
        <View className="flex-1 items-center justify-center px-8 pb-10">
          <Ionicons name="cloud-offline-outline" size={42} color={colors.textSecondary} />
          <Text className="mb-2 mt-4 text-center text-2xl font-bold" style={{ color: colors.text }}>
            Couldn&apos;t load list
          </Text>
          <Text className="mb-6 text-center text-base leading-6" style={{ color: colors.textSecondary }}>
            Check your connection and try again.
          </Text>
          <Pressable
            className="rounded-[22px] px-6 py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
            onPress={() => void refresh()}
          >
            <Text className="text-base font-bold text-white">Try again</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen tabScreen>
      <View className="flex-1 px-5 pt-2">
        <View className="flex-row items-start gap-3">
          <View className="min-w-0 flex-1">
            <BrandHeader title="List" subtitle="Groceries for your recipes" />
          </View>
          {items.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Clear list"
              className="mt-1 flex-row items-center gap-1.5 rounded-2xl px-3 py-2.5 active:opacity-80"
              style={{ backgroundColor: colors.dangerSoft }}
              onPress={handleDeleteAll}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text className="text-xs font-bold" style={{ color: colors.danger }}>
                Clear list
              </Text>
            </Pressable>
          ) : null}
        </View>

        {error && items.length > 0 && (
          <View
            className="mt-4 flex-row items-center gap-3 rounded-[18px] px-4 py-3"
            style={{ backgroundColor: colors.dangerSoft }}
          >
            <Text className="flex-1 text-sm" style={{ color: colors.danger }}>
              Couldn&apos;t refresh — showing your last list.
            </Text>
            <Pressable onPress={() => void refresh()} hitSlop={8}>
              <Text className="text-sm font-bold" style={{ color: colors.danger }}>
                Retry
              </Text>
            </Pressable>
          </View>
        )}

        <View
          className="mt-5 gap-2 rounded-3xl border p-3"
          style={{ backgroundColor: colors.surface, borderColor: colors.frostedBorder }}
        >
          <TextInput
            className="rounded-2xl border px-4 py-3 text-base"
            style={{
              color: colors.text,
              borderColor: colors.frostedBorder,
              backgroundColor: colors.background,
            }}
            placeholder="Item name"
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            returnKeyType="next"
            onSubmitEditing={() => void handleAdd()}
          />
          {typingDuplicateCount > 0 ? (
            <Text className="px-1 text-xs font-medium" style={{ color: colors.warning }}>
              Already on your list · {typingDuplicateCount} line
              {typingDuplicateCount === 1 ? '' : 's'} (you can still add another)
            </Text>
          ) : null}
          <View className="flex-row gap-2">
            <TextInput
              className="w-[30%] rounded-2xl border px-3 py-3 text-base"
              style={{
                color: colors.text,
                borderColor: colors.frostedBorder,
                backgroundColor: colors.background,
              }}
              placeholder="Qty"
              placeholderTextColor={colors.textSecondary}
              value={quantityText}
              onChangeText={setQuantityText}
              keyboardType="decimal-pad"
            />
            <TextInput
              className="flex-1 rounded-2xl border px-3 py-3 text-base"
              style={{
                color: colors.text,
                borderColor: colors.frostedBorder,
                backgroundColor: colors.background,
              }}
              placeholder="Unit (optional)"
              placeholderTextColor={colors.textSecondary}
              value={unit}
              onChangeText={setUnit}
              returnKeyType="done"
              onSubmitEditing={() => void handleAdd()}
            />
            <Pressable
              className="items-center justify-center rounded-2xl px-4 active:opacity-80"
              style={{ backgroundColor: colors.primary, opacity: adding ? 0.7 : 1 }}
              disabled={adding}
              onPress={() => void handleAdd()}
            >
              {adding ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Ionicons name="add" size={22} color="#fff" />
              )}
            </Pressable>
          </View>
        </View>

        {notice ? (
          <View
            className="mt-3 flex-row items-start gap-2 rounded-2xl px-3.5 py-3"
            style={{ backgroundColor: colors.warningSoft }}
          >
            <Ionicons name="information-circle" size={18} color={colors.warning} style={{ marginTop: 1 }} />
            <View className="min-w-0 flex-1">
              <Text className="text-sm leading-5" style={{ color: colors.text }}>
                {notice.message}
              </Text>
              {notice.combineName ? (
                <Pressable
                  className="mt-2 self-start active:opacity-70"
                  onPress={() => void handleCombine(notice.combineName!)}
                >
                  <Text className="text-sm font-bold" style={{ color: colors.warning }}>
                    Combine into one line
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable onPress={() => setNotice(null)} hitSlop={8}>
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center px-4 pb-10">
            <BrandHeader
              size="hero"
              align="center"
              title="List is empty"
              subtitle="Add items above, or open a recipe and tap Add to list."
            />
            <Pressable
              className="mt-8 rounded-[22px] px-6 py-3.5 active:opacity-80"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.push('/')}
            >
              <Text className="text-base font-bold text-white">Browse recipes</Text>
            </Pressable>
          </View>
        ) : (
          <>
            <FlatList
              className="mt-4 flex-1"
              data={items}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={{ paddingBottom: 16 }}
              ListHeaderComponent={
                checkedCount > 0 ? (
                  <Text
                    className="mb-2 text-xs font-semibold uppercase tracking-wide"
                    style={{ color: colors.textSecondary }}
                  >
                    {items.length - checkedCount} left · {checkedCount} checked
                  </Text>
                ) : null
              }
            />
            <View className="pb-3 pt-1">
              <Pressable
                className="items-center rounded-2xl border py-3 active:opacity-80"
                style={{ borderColor: colors.frostedBorder }}
                onPress={handleClearChecked}
                disabled={checkedCount === 0}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: checkedCount === 0 ? colors.textSecondary : colors.text }}
                >
                  Clear checked
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>

      <Modal
        visible={editingItem != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingItem(null)}
      >
        <SafeAreaView className="flex-1" style={{ backgroundColor: colors.background }}>
          <View
            className="flex-row items-center justify-between border-b px-5 py-4"
            style={{ borderColor: colors.frostedBorder }}
          >
            <Pressable onPress={() => setEditingItem(null)}>
              <Text style={{ color: colors.textSecondary }}>Cancel</Text>
            </Pressable>
            <Text className="text-base font-bold" style={{ color: colors.text }}>
              Edit item
            </Text>
            <Pressable onPress={() => void handleSaveEdit()} disabled={savingEdit}>
              {savingEdit ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text className="font-bold" style={{ color: colors.primary }}>
                  Save
                </Text>
              )}
            </Pressable>
          </View>
          <View className="gap-3 px-5 pt-5">
            <TextInput
              className="rounded-2xl border px-4 py-3 text-base"
              style={{
                color: colors.text,
                borderColor: colors.frostedBorder,
                backgroundColor: colors.surface,
              }}
              placeholder="Name"
              placeholderTextColor={colors.textSecondary}
              value={editName}
              onChangeText={setEditName}
            />
            <View className="flex-row gap-2">
              <TextInput
                className="w-[35%] rounded-2xl border px-4 py-3 text-base"
                style={{
                  color: colors.text,
                  borderColor: colors.frostedBorder,
                  backgroundColor: colors.surface,
                }}
                placeholder="Qty"
                placeholderTextColor={colors.textSecondary}
                value={editQuantity}
                onChangeText={setEditQuantity}
                keyboardType="decimal-pad"
              />
              <TextInput
                className="flex-1 rounded-2xl border px-4 py-3 text-base"
                style={{
                  color: colors.text,
                  borderColor: colors.frostedBorder,
                  backgroundColor: colors.surface,
                }}
                placeholder="Unit"
                placeholderTextColor={colors.textSecondary}
                value={editUnit}
                onChangeText={setEditUnit}
              />
            </View>
          </View>
        </SafeAreaView>
      </Modal>
    </Screen>
  );
}
