import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BrandHeader } from '@/components/BrandHeader';
import { ConfirmDialog } from '@/components/ConfirmDialog';
import { Screen } from '@/components/Screen';
import { SelectRecipesForShoppingListModal } from '@/components/SelectRecipesForShoppingListModal';
import { useCollections } from '@/hooks/useCollections';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useRecipes } from '@/hooks/useRecipes';
import { useRtl } from '@/hooks/useRtl';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { pickIngredientAmount } from '@/lib/ingredientAmounts';
import { formatQuantity } from '@/lib/formatQuantity';
import {
  getDuplicateNameCounts,
  normalizeShoppingName,
} from '@/lib/shoppingListMerge';
import type { ShoppingListItem } from '@/types/shoppingList';

export default function ShoppingListScreen() {
  const {
    items,
    loading,
    error,
    refresh,
    addManual,
    addFromRecipes,
    combineDuplicates,
    toggleChecked,
    updateItem,
    removeItem,
    clearChecked,
    clearAll,
  } = useShoppingList();
  const { recipes } = useRecipes();
  const { collections } = useCollections();
  const { system: measurementSystem } = useMeasurementPreference();
  const { colors } = useThemePreference();
  const { language: appLanguage } = useLanguagePreference();
  const { rtl } = useRtl();
  const { t } = useTranslation();

  const [name, setName] = useState('');
  const [quantityText, setQuantityText] = useState('');
  const [unit, setUnit] = useState('');
  const [adding, setAdding] = useState(false);
  const [fromRecipesOpen, setFromRecipesOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<ShoppingListItem | null>(null);
  const [editName, setEditName] = useState('');
  const [editQuantity, setEditQuantity] = useState('');
  const [editUnit, setEditUnit] = useState('');
  const [savingEdit, setSavingEdit] = useState(false);
  const [confirmAction, setConfirmAction] = useState<{
    title: string;
    message: string;
    label: string;
    run: () => Promise<void>;
  } | null>(null);
  const [confirming, setConfirming] = useState(false);
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
          t('list.combineFailed'),
          err instanceof Error ? err.message : t('common.tryAgain'),
        );
      }
    },
    [combineDuplicates, t],
  );

  const handleAddFromRecipes = useCallback(
    async (selectedIds: string[]) => {
      const selected = recipes.filter((recipe) => selectedIds.includes(recipe.id));
      const payload = selected.map((recipe) => ({
        id: recipe.id,
        ingredients: (recipe.ingredients ?? []).map((ing) => {
          const converted = pickIngredientAmount(ing, measurementSystem);
          return {
            name: ing.name,
            quantity: converted.quantity,
            unit: converted.unit,
          };
        }),
      }));

      const result = await addFromRecipes(payload);
      Alert.alert(
        t('list.fromRecipesSuccessTitle'),
        t('list.fromRecipesSuccessBody', {
          recipes: selected.length,
          added: result.addedCount,
          merged: result.mergedCount,
        }),
      );
    },
    [addFromRecipes, measurementSystem, recipes, t],
  );

  const handleAdd = useCallback(async () => {
    const trimmedName = name.trim();
    if (!trimmedName) {
      Alert.alert(t('list.nameRequired'), t('list.enterItem'));
      return;
    }

    let quantity: number | null = null;
    const qtyTrimmed = quantityText.trim();
    if (qtyTrimmed) {
      const parsed = Number(qtyTrimmed);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert(t('list.invalidAmount'), t('list.positiveQuantity'));
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
          message: t('list.alreadyListed', { name: label }),
          combineName: label,
        });
      } else {
        setNotice(null);
      }
    } catch (err) {
      Alert.alert(
        t('list.addFailed'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setAdding(false);
    }
  }, [addManual, name, quantityText, t, unit]);

  const handleToggle = useCallback(
    async (item: ShoppingListItem) => {
      try {
        await toggleChecked(item.id);
      } catch (err) {
        Alert.alert(
          t('list.updateFailed'),
          err instanceof Error ? err.message : t('common.tryAgain'),
        );
      }
    },
    [t, toggleChecked],
  );

  const handleRemove = useCallback(
    async (item: ShoppingListItem) => {
      try {
        await removeItem(item.id);
      } catch (err) {
        Alert.alert(
          t('list.removeFailed'),
          err instanceof Error ? err.message : t('common.tryAgain'),
        );
      }
    },
    [removeItem, t],
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
      Alert.alert(t('list.nameRequired'), t('list.enterItemName'));
      return;
    }

    let quantity: number | null = null;
    const raw = editQuantity.trim();
    if (raw) {
      const parsed = Number(raw);
      if (!Number.isFinite(parsed) || parsed <= 0) {
        Alert.alert(t('list.invalidAmount'), t('list.positiveQuantity'));
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
        t('list.updateFailed'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      setSavingEdit(false);
    }
  }, [editName, editQuantity, editUnit, editingItem, t, updateItem]);

  const handleLongPress = useCallback(
    (item: ShoppingListItem) => {
      const dupCount = duplicateCounts.get(normalizeShoppingName(item.name)) ?? 0;
      const buttons: {
        text: string;
        style?: 'cancel' | 'destructive';
        onPress?: () => void;
      }[] = [
        { text: t('common.cancel'), style: 'cancel' },
        { text: t('common.edit'), onPress: () => openEdit(item) },
      ];

      if (dupCount > 1) {
        buttons.push({
          text: t('list.combineDuplicates'),
          onPress: () => void handleCombine(item.name),
        });
      }

      buttons.push({
        text: t('common.remove'),
        style: 'destructive',
        onPress: () => handleRemove(item),
      });

      Alert.alert(item.name, undefined, buttons);
    },
    [duplicateCounts, handleCombine, handleRemove, openEdit, t],
  );

  const handleClearChecked = useCallback(() => {
    if (checkedCount === 0) return;
    setConfirmAction({
      title: t('list.clearCheckedTitle'),
      message: t(
        checkedCount === 1 ? 'list.clearCheckedBodyOne' : 'list.clearCheckedBodyOther',
        { count: checkedCount },
      ),
      label: t('list.clearChecked'),
      run: async () => {
        try {
          await clearChecked();
        } catch (err) {
          Alert.alert(
            t('list.clearFailed'),
            err instanceof Error ? err.message : t('common.tryAgain'),
          );
        }
      },
    });
  }, [checkedCount, clearChecked, t]);

  const handleDeleteAll = useCallback(() => {
    if (items.length === 0) return;
    setConfirmAction({
      title: t('list.deleteAllTitle'),
      message: t(items.length === 1 ? 'list.deleteAllBodyOne' : 'list.deleteAllBodyOther', {
        count: items.length,
      }),
      label: t('list.deleteAll'),
      run: async () => {
        try {
          await clearAll();
        } catch (err) {
          Alert.alert(
            t('list.deleteFailed'),
            err instanceof Error ? err.message : t('common.tryAgain'),
          );
        }
      },
    });
  }, [clearAll, items.length, t]);

  const renderItem = useCallback(
    ({ item }: { item: ShoppingListItem }) => {
      const amount =
        item.quantity != null
          ? formatQuantity(item.quantity, item.unit ?? '', appLanguage)
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
            borderStartWidth: isDuplicate ? 3 : 1,
            borderStartColor: isDuplicate ? colors.warning : colors.frostedBorder,
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
                        t('list.duplicateTitle'),
                        t('list.duplicateBody', { name: item.name, count: dupCount }),
                        [
                          { text: t('list.keepSeparate'), style: 'cancel' },
                          {
                            text: t('list.combine'),
                            onPress: () => void handleCombine(item.name),
                          },
                        ],
                      );
                    }}
                    hitSlop={6}
                  >
                    <Text className="text-[11px] font-bold" style={{ color: colors.warning }}>
                      {t('list.alsoListed', { count: dupCount })}
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
            accessibilityLabel={t('list.editItemLabel', { name: item.name })}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-70"
            hitSlop={8}
            onPress={() => openEdit(item)}
          >
            <Ionicons name="pencil-outline" size={18} color={colors.textSecondary} />
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('list.removeItemLabel', { name: item.name })}
            className="min-h-[44px] min-w-[44px] items-center justify-center rounded-full active:opacity-70"
            hitSlop={8}
            onPress={() => void handleRemove(item)}
          >
            <Ionicons name="trash-outline" size={18} color={colors.textSecondary} />
          </Pressable>
        </View>
      );
    },
    [
      appLanguage,
      colors,
      duplicateCounts,
      handleCombine,
      handleLongPress,
      handleRemove,
      handleToggle,
      openEdit,
      t,
    ],
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
            {t('list.loadFailedTitle')}
          </Text>
          <Text className="mb-6 text-center text-base leading-6" style={{ color: colors.textSecondary }}>
            {t('list.loadFailedBody')}
          </Text>
          <Pressable
            className="rounded-[22px] px-6 py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
            onPress={() => void refresh()}
          >
            <Text className="text-base font-bold text-white">{t('common.tryAgainAction')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  return (
    <Screen tabScreen>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
      <View className="flex-1 px-5 pt-2">
        <View className="flex-row items-start gap-3">
          <View className="min-w-0 flex-1">
            <BrandHeader title={t('list.title')} subtitle={t('list.subtitle')} />
          </View>
          {items.length > 0 ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('list.clearList')}
              className="mt-1 flex-row items-center gap-1.5 rounded-2xl px-3 py-2.5 active:opacity-80"
              style={{ backgroundColor: colors.dangerSoft }}
              onPress={handleDeleteAll}
            >
              <Ionicons name="trash-outline" size={16} color={colors.danger} />
              <Text className="text-xs font-bold" style={{ color: colors.danger }}>
                {t('list.clearList')}
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
              {t('list.refreshFailed')}
            </Text>
            <Pressable onPress={() => void refresh()} hitSlop={8}>
              <Text className="text-sm font-bold" style={{ color: colors.danger }}>
                {t('common.retry')}
              </Text>
            </Pressable>
          </View>
        )}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('list.fromRecipes')}
          className="mt-5 flex-row items-center justify-center gap-2 rounded-3xl border px-4 py-3.5 active:opacity-80"
          style={{
            backgroundColor: colors.surface,
            borderColor: colors.frostedBorder,
          }}
          onPress={() => setFromRecipesOpen(true)}
        >
          <Ionicons name="restaurant-outline" size={18} color={colors.primary} />
          <Text className="text-sm font-bold" style={{ color: colors.primary }}>
            {t('list.fromRecipes')}
          </Text>
        </Pressable>

        <View
          className="mt-3 gap-2 rounded-3xl border p-3"
          style={{ backgroundColor: colors.surface, borderColor: colors.frostedBorder }}
        >
          <TextInput
            className="rounded-2xl border px-4 py-3 text-base"
            style={{
              color: colors.text,
              borderColor: colors.frostedBorder,
              backgroundColor: colors.background,
            }}
            placeholder={t('list.itemName')}
            placeholderTextColor={colors.textSecondary}
            value={name}
            onChangeText={setName}
            returnKeyType="next"
            onSubmitEditing={() => void handleAdd()}
          />
          {typingDuplicateCount > 0 ? (
            <Text className="px-1 text-xs font-medium" style={{ color: colors.warning }}>
              {t(
                typingDuplicateCount === 1
                  ? 'list.typingDuplicateOne'
                  : 'list.typingDuplicateOther',
                { count: typingDuplicateCount },
              )}
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
              placeholder={t('list.quantityShort')}
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
              placeholder={t('list.unitOptional')}
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
              accessibilityRole="button"
              accessibilityLabel={t('list.addItem')}
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
                    {t('list.combineOneLine')}
                  </Text>
                </Pressable>
              ) : null}
            </View>
            <Pressable
              onPress={() => setNotice(null)}
              hitSlop={8}
              accessibilityRole="button"
              accessibilityLabel={t('common.dismiss')}
            >
              <Ionicons name="close" size={18} color={colors.textSecondary} />
            </Pressable>
          </View>
        ) : null}

        {items.length === 0 ? (
          <View className="flex-1 items-center justify-center px-4 pb-10">
            <BrandHeader
              size="hero"
              align="center"
              title={t('list.emptyTitle')}
              subtitle={t('list.emptyBody')}
            />
            <Pressable
              className="mt-8 rounded-[22px] px-6 py-3.5 active:opacity-80"
              style={{ backgroundColor: colors.primary }}
              onPress={() => router.push('/')}
            >
              <Text className="text-base font-bold text-white">{t('list.browseRecipes')}</Text>
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
                    {t('list.progress', {
                      left: items.length - checkedCount,
                      checked: checkedCount,
                    })}
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
                  {t('list.clearChecked')}
                </Text>
              </Pressable>
            </View>
          </>
        )}
      </View>
      </KeyboardAvoidingView>

      <Modal
        visible={editingItem != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingItem(null)}
      >
        <SafeAreaView
          className="flex-1"
          style={{ backgroundColor: colors.background, direction: rtl ? 'rtl' : 'ltr' }}
        >
          <KeyboardAvoidingView
            className="flex-1"
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
          <View
            className="flex-row items-center justify-between border-b px-5 py-4"
            style={{ borderColor: colors.frostedBorder }}
          >
            <Pressable onPress={() => setEditingItem(null)}>
              <Text style={{ color: colors.textSecondary }}>{t('common.cancel')}</Text>
            </Pressable>
            <Text className="text-base font-bold" style={{ color: colors.text }}>
              {t('list.editItem')}
            </Text>
            <Pressable onPress={() => void handleSaveEdit()} disabled={savingEdit}>
              {savingEdit ? (
                <ActivityIndicator color={colors.primary} />
              ) : (
                <Text className="font-bold" style={{ color: colors.primary }}>
                  {t('common.save')}
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
              placeholder={t('library.namePlaceholder')}
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
                placeholder={t('list.quantityShort')}
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
                placeholder={t('list.unit')}
                placeholderTextColor={colors.textSecondary}
                value={editUnit}
                onChangeText={setEditUnit}
              />
            </View>
          </View>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </Modal>

      <SelectRecipesForShoppingListModal
        visible={fromRecipesOpen}
        recipes={recipes}
        collections={collections}
        onClose={() => setFromRecipesOpen(false)}
        onConfirm={handleAddFromRecipes}
      />

      <ConfirmDialog
        visible={confirmAction != null}
        title={confirmAction?.title ?? ''}
        message={confirmAction?.message ?? ''}
        confirmLabel={confirmAction?.label ?? t('common.delete')}
        cancelLabel={t('common.cancel')}
        destructive
        loading={confirming}
        onCancel={() => {
          if (!confirming) setConfirmAction(null);
        }}
        onConfirm={() => {
          if (!confirmAction) return;
          setConfirming(true);
          void confirmAction.run().finally(() => {
            setConfirming(false);
            setConfirmAction(null);
          });
        }}
      />
    </Screen>
  );
}
