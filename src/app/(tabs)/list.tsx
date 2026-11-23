import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ComponentProps, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FieldInput } from '@/components/text-input';
import { Screen } from '@/components/Screen';
import { SelectRecipesForShoppingListModal } from '@/components/SelectRecipesForShoppingListModal';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge, TileLabel } from '@/components/ui/Tile';
import { TopBar } from '@/components/ui/TopBar';
import { HAIRLINE } from '@/components/ui/tokens';
import { FormContentWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCollections } from '@/hooks/useCollections';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useUnitSystemPreference } from '@/hooks/useUnitSystemPreference';
import { useRecipes } from '@/hooks/useRecipes';
import { useRtl } from '@/hooks/useRtl';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce, CHROME_MAX_FONT_SCALE } from '@/lib/a11y';
import { pickIngredientAmount } from '@shared/lib/ingredientAmounts';
import { filterPantryStaples } from '@shared/lib/pantryStaples';
import { formatQuantity } from '@shared/lib/formatQuantity';
import { logTap } from '@/lib/interactionLog';
import {
  getDuplicateNameCounts,
  normalizeShoppingName,
} from '@shared/lib/shoppingListMerge';
import { SHOPPING_AISLE_ORDER, shoppingAisleForName } from '@shared/lib/shoppingAisles';
import type { ShoppingListItem } from '@shared/types/shoppingList';

/** One aisle (or "Checked") on its own tile. */
type ListGroup = { id: string; title: string; checked: boolean; items: ShoppingListItem[] };

/**
 * The shopping list (Night Market, PIN-177): what to buy, grouped the way a shop is laid out, each aisle a tile with
 * hairlines between its items, and everything checked on an outlined tile at the end. Tap an item to check it off;
 * long-press for edit, combine and remove.
 */
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
  const { pantryStaples, keepStaple } = useKitchenProfile();
  const { recipes } = useRecipes();
  const { collections } = useCollections();
  const { system: measurementSystem } = useMeasurementPreference();
  const { units } = useUnitSystemPreference();
  const { colors } = useThemePreference();
  const { language: appLanguage } = useLanguagePreference();
  const { rtl } = useRtl();
  const { isMediumUp } = useBreakpoint();
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

  const showRefreshError = Boolean(error) && items.length > 0;
  useEffect(() => {
    if (showRefreshError) announce(t('list.refreshFailed'));
  }, [showRefreshError, t]);

  const noticeMessage = notice?.message;
  useEffect(() => {
    if (noticeMessage) announce(noticeMessage);
  }, [noticeMessage]);

  const checkedCount = useMemo(() => items.filter((item) => item.checked).length, [items]);
  const duplicateCounts = useMemo(() => getDuplicateNameCounts(items), [items]);

  const groups = useMemo((): ListGroup[] => {
    const result: ListGroup[] = [];
    const unchecked = items.filter((item) => !item.checked);
    const checked = items.filter((item) => item.checked);
    for (const aisle of SHOPPING_AISLE_ORDER) {
      const group = unchecked.filter((item) => shoppingAisleForName(item.name) === aisle);
      if (group.length === 0) continue;
      result.push({ id: `aisle-${aisle}`, title: t(`list.aisles.${aisle}`), checked: false, items: group });
    }
    if (checked.length > 0) {
      result.push({ id: 'checked', title: t('list.checkedSection'), checked: true, items: checked });
    }
    return result;
  }, [items, t]);

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
        ingredients: filterPantryStaples(recipe.ingredients ?? [], pantryStaples).kept.map((ing) => {
          const converted = pickIngredientAmount(ing, measurementSystem, units);
          return {
            name: ing.name,
            quantity: converted.quantity,
            unit: converted.unit,
          };
        }),
      }));
      const skipped = selected.flatMap((recipe) =>
        filterPantryStaples(recipe.ingredients ?? [], pantryStaples).skipped,
      );

      const result = await addFromRecipes(payload);
      const pantryNote =
        skipped.length === 0
          ? ''
          : skipped.length === 1
            ? `\n\n${t('list.pantrySkippedOne', { name: skipped[0].name })}`
            : `\n\n${t('list.pantrySkippedOther', { count: skipped.length })}`;
      Alert.alert(
        t('list.fromRecipesSuccessTitle'),
        `${t('list.fromRecipesSuccessBody', {
          recipes: selected.length,
          added: result.addedCount,
          merged: result.mergedCount,
        })}${pantryNote}`,
      );
    },
    [addFromRecipes, measurementSystem, pantryStaples, recipes, t, units],
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

  const renderItemRow = useCallback(
    (item: ShoppingListItem) => {
      const amount =
        item.quantity != null
          ? formatQuantity(item.quantity, item.unit ?? '', appLanguage)
          : item.unit
            ? item.unit
            : null;
      const dupCount = duplicateCounts.get(normalizeShoppingName(item.name)) ?? 0;
      const isDuplicate = dupCount > 1;
      const showDuplicatePrompt = () => {
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
      };
      const itemA11yLabel = [
        item.name,
        amount,
        isDuplicate ? t('list.alsoListed', { count: dupCount }) : null,
      ]
        .filter(Boolean)
        .join(', ');

      return (
        <View style={{ flexDirection: 'row', alignItems: 'center', minHeight: 56 }}>
          <Pressable
            trackId="shopping_list.item.toggle"
            onPress={() => void handleToggle(item)}
            onLongPress={() => handleLongPress(item)}
            accessibilityRole="checkbox"
            accessibilityState={{ checked: item.checked }}
            accessibilityLabel={itemA11yLabel}
            accessibilityActions={[
              { name: 'longpress', label: t('a11y.moreOptions') },
              ...(isDuplicate ? [{ name: 'combine', label: t('list.combineDuplicates') }] : []),
            ]}
            onAccessibilityAction={(event) => {
              if (event.nativeEvent.actionName === 'longpress') handleLongPress(item);
              else if (event.nativeEvent.actionName === 'combine') showDuplicatePrompt();
            }}
            style={({ pressed }) => ({
              flex: 1,
              minWidth: 0,
              flexDirection: 'row',
              alignItems: 'center',
              gap: 12,
              alignSelf: 'stretch',
              paddingVertical: 10,
              paddingHorizontal: 8,
              borderRadius: 16,
              backgroundColor: pressed ? colors.backgroundElement : 'transparent',
            })}
          >
            {/* A round check, filled with the brand colour once ticked off. */}
            <View
              style={{
                width: 24,
                height: 24,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderWidth: item.checked ? 0 : 2,
                borderColor: colors.textSecondary,
                backgroundColor: item.checked ? colors.primary : 'transparent',
              }}
            >
              {item.checked ? <Ionicons name="checkmark" size={15} color={colors.onPrimary} /> : null}
            </View>
            <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
              <Text
                variant="bodySmall"
                weight="semibold"
                tone={item.checked ? 'muted' : 'default'}
                numberOfLines={2}
                style={item.checked ? { textDecorationLine: 'line-through' } : null}
              >
                {item.name}
              </Text>
              {amount ? (
                <Text variant="caption" tone="muted" style={{ fontVariant: ['tabular-nums'] }}>
                  {amount}
                </Text>
              ) : null}
              {isDuplicate ? (
                <Pressable
                  trackId="shopping_list.item.duplicate_badge"
                  onPress={showDuplicatePrompt}
                  hitSlop={{ top: 10, bottom: 10, left: 6, right: 6 }}
                  accessibilityRole="button"
                  style={{
                    alignSelf: 'flex-start',
                    marginTop: 4,
                    borderRadius: 8,
                    paddingHorizontal: 8,
                    paddingVertical: 3,
                    backgroundColor: colors.warningSoft,
                  }}
                >
                  <Text
                    variant="caption"
                    weight="bold"
                    color={colors.warning}
                    maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                    style={{ fontSize: 12, lineHeight: 16 }}
                  >
                    {t('list.alsoListed', { count: dupCount })}
                  </Text>
                </Pressable>
              ) : null}
            </View>
          </Pressable>
          {!item.checked ? (
            <IconButton
              trackId="shopping_list.item.keep_in_pantry"
              icon="home-outline"
              iconSize={19}
              label={t('list.keepThisLabel', { name: item.name })}
              onPress={() => {
                keepStaple(item.name);
                void handleRemove(item);
                setNotice({ message: t('list.pantrySaved', { name: item.name }) });
              }}
            />
          ) : null}
          <IconButton
            trackId="shopping_list.item.edit"
            icon="pencil-outline"
            iconSize={19}
            label={t('list.editItemLabel', { name: item.name })}
            onPress={() => openEdit(item)}
          />
          <IconButton
            trackId="shopping_list.item.remove"
            icon="trash-outline"
            iconSize={19}
            label={t('list.removeItemLabel', { name: item.name })}
            onPress={() => void handleRemove(item)}
          />
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
      keepStaple,
      openEdit,
      t,
    ],
  );

  const renderGroup = useCallback(
    ({ item: group }: { item: ListGroup }) => (
      <Tile
        // The checked group is an outline with no fill, so what is left to buy stands out.
        style={[
          { paddingHorizontal: 8, paddingTop: 6, paddingBottom: 6 },
          group.checked ? { backgroundColor: 'transparent' } : null,
        ]}
      >
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 12,
            minHeight: 44,
            paddingStart: 8,
          }}
        >
          <View
            accessible
            accessibilityRole="header"
            accessibilityLabel={`${group.title}, ${t(
              group.items.length === 1 ? 'a11y.itemCountOne' : 'a11y.itemCountOther',
              { count: group.items.length },
            )}`}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10, flexShrink: 1 }}
          >
            <TileLabel numberOfLines={1} style={{ flexShrink: 1 }}>
              {group.title}
            </TileLabel>
            <TileBadge>{String(group.items.length)}</TileBadge>
          </View>
          {group.checked ? (
            <Button
              trackId="shopping_list.clear_checked"
              variant="ghost"
              size="sm"
              icon="close-circle-outline"
              onPress={handleClearChecked}
            >
              {t('list.clearChecked')}
            </Button>
          ) : null}
        </View>
        {group.items.map((item, index) => (
          <View key={item.id}>
            {index > 0 ? (
              <View
                accessible={false}
                importantForAccessibility="no"
                style={{ height: HAIRLINE, backgroundColor: colors.border, marginStart: 44, marginEnd: 8 }}
              />
            ) : null}
            {renderItemRow(item)}
          </View>
        ))}
      </Tile>
    ),
    [colors.border, handleClearChecked, renderItemRow, t],
  );

  const widthStyle = isMediumUp
    ? ({ maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' } as const)
    : null;

  if (loading && items.length === 0) {
    return (
      <Screen tabScreen style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel={t('a11y.loading')} />
      </Screen>
    );
  }

  if (error && items.length === 0) {
    return (
      <Screen tabScreen>
        <View style={[{ flex: 1, paddingHorizontal: 20 }, widthStyle]}>
          <TopBar />
          <PageHeader title={t('list.title')} style={{ marginTop: 8 }} />
          <StateTile
            icon="cloud-offline-outline"
            title={t('list.loadFailedTitle')}
            body={t('list.loadFailedBody')}
            action={
              <Button trackId="shopping_list.load_error.retry" icon="refresh" onPress={() => void refresh()}>
                {t('common.tryAgainAction')}
              </Button>
            }
          />
        </View>
      </Screen>
    );
  }

  const header = (
    <View style={{ gap: 12, marginBottom: 16 }}>
      <View>
        <TopBar />
        <PageHeader
          title={t('list.title')}
          subtitle={
            items.length > 0
              ? t('list.progress', { left: items.length - checkedCount, checked: checkedCount })
              : t('list.subtitle')
          }
          style={{ marginTop: 8, paddingBottom: 8 }}
          actions={
            items.length > 0 ? (
              <IconButton
                variant="tile"
                icon="trash-outline"
                label={t('list.clearList')}
                trackId="shopping_list.clear_all"
                onPress={handleDeleteAll}
              />
            ) : null
          }
        />
      </View>

      <Button
        trackId="shopping_list.from_recipes"
        variant="secondary"
        icon="restaurant-outline"
        fullWidth
        accessibilityLabel={t('list.fromRecipes')}
        onPress={() => setFromRecipesOpen(true)}
      >
        {t('list.fromRecipes')}
      </Button>

      {/* Always ready to type into: the name, then an amount and unit if you like. */}
      <Tile padding={12} style={{ gap: 8 }}>
        <FieldInput
          placeholder={t('list.addItemToggle')}
          accessibilityLabel={t('list.itemName')}
          value={name}
          onChangeText={setName}
          maxLength={120}
          returnKeyType="done"
          onSubmitEditing={() => {
            logTap('shopping_list.add.name_submit_key');
            void handleAdd();
          }}
          leading={<Ionicons name="add" size={20} color={colors.textSecondary} />}
        />
        {typingDuplicateCount > 0 ? (
          <Text
            variant="caption"
            weight="medium"
            color={colors.warning}
            accessibilityLiveRegion="polite"
            style={{ paddingHorizontal: 4 }}
          >
            {t(
              typingDuplicateCount === 1 ? 'list.typingDuplicateOne' : 'list.typingDuplicateOther',
              { count: typingDuplicateCount },
            )}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <FieldInput
            containerStyle={{ width: 84 }}
            placeholder={t('list.quantityShort')}
            accessibilityLabel={t('a11y.quantity')}
            value={quantityText}
            onChangeText={setQuantityText}
            keyboardType="decimal-pad"
            maxLength={10}
          />
          <FieldInput
            containerStyle={{ flex: 1 }}
            placeholder={t('list.unit')}
            accessibilityLabel={t('list.unitOptional')}
            value={unit}
            onChangeText={setUnit}
            maxLength={30}
            returnKeyType="done"
            onSubmitEditing={() => {
              logTap('shopping_list.add.unit_submit_key');
              void handleAdd();
            }}
          />
          <Button
            trackId="shopping_list.add.submit"
            icon="add"
            busy={adding}
            accessibilityLabel={t('list.addItem')}
            onPress={() => void handleAdd()}
          >
            {t('list.addItem')}
          </Button>
        </View>
      </Tile>

      {showRefreshError ? (
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            gap: 10,
            borderRadius: 16,
            paddingVertical: 4,
            paddingStart: 14,
            paddingEnd: 4,
            backgroundColor: colors.dangerSoft,
          }}
        >
          <Ionicons name="alert-circle-outline" size={18} color={colors.danger} />
          <Text variant="caption" tone="danger" style={{ flex: 1 }}>
            {t('list.refreshFailed')}
          </Text>
          <Button trackId="shopping_list.refresh_error.retry" variant="ghost" size="sm" onPress={() => void refresh()}>
            {t('common.retry')}
          </Button>
        </View>
      ) : null}

      {notice ? (
        <View
          accessibilityRole="summary"
          style={{
            flexDirection: 'row',
            alignItems: 'flex-start',
            gap: 10,
            borderRadius: 16,
            paddingVertical: 4,
            paddingStart: 14,
            paddingEnd: 0,
            backgroundColor: colors.warningSoft,
          }}
        >
          <View accessible={false} importantForAccessibility="no-hide-descendants" style={{ paddingTop: 12 }}>
            <Ionicons name="information-circle" size={18} color={colors.warning} />
          </View>
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 10, gap: 4 }}>
            <Text variant="caption">{notice.message}</Text>
            {notice.combineName ? (
              <Button
                trackId="shopping_list.notice.combine"
                variant="link"
                onPress={() => void handleCombine(notice.combineName!)}
              >
                {t('list.combineOneLine')}
              </Button>
            ) : null}
          </View>
          <IconButton
            trackId="shopping_list.notice.dismiss"
            icon="close"
            iconSize={18}
            label={t('common.dismiss')}
            onPress={() => setNotice(null)}
          />
        </View>
      ) : null}
    </View>
  );

  return (
    <Screen tabScreen>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <FlatList
          style={{ flex: 1 }}
          data={groups}
          keyExtractor={(group) => group.id}
          renderItem={renderGroup}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[{ paddingHorizontal: 20, paddingBottom: 24 }, widthStyle]}
          ItemSeparatorComponent={GroupGap}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <StateTile
              icon="basket-outline"
              title={t('list.emptyTitle')}
              body={t('web.list.emptyBody')}
              action={
                <Button
                  trackId="shopping_list.empty.browse_recipes"
                  variant="outline"
                  icon="book-outline"
                  onPress={() => router.push('/')}
                >
                  {t('list.browseRecipes')}
                </Button>
              }
            />
          }
        />
      </KeyboardAvoidingView>

      <Modal
        visible={editingItem != null}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setEditingItem(null)}
      >
        <SafeAreaView
          style={{ flex: 1, backgroundColor: colors.background, direction: rtl ? 'rtl' : 'ltr' }}
          accessibilityViewIsModal
          onAccessibilityEscape={() => setEditingItem(null)}
        >
          <KeyboardAvoidingView
            style={{ flex: 1 }}
            behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          >
            <View
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 8,
                paddingHorizontal: 12,
                paddingVertical: 8,
                borderBottomWidth: HAIRLINE,
                borderColor: colors.border,
              }}
            >
              <Button trackId="shopping_list.edit.cancel" variant="ghost" size="sm" onPress={() => setEditingItem(null)}>
                {t('common.cancel')}
              </Button>
              <Text variant="h3" align="center" numberOfLines={1} style={{ flexShrink: 1 }}>
                {t('list.editItem')}
              </Text>
              <Button
                trackId="shopping_list.edit.save"
                size="sm"
                busy={savingEdit}
                accessibilityLabel={t('common.save')}
                onPress={() => void handleSaveEdit()}
              >
                {t('common.save')}
              </Button>
            </View>
            <View style={{ gap: 10, paddingHorizontal: 20, paddingTop: 20 }}>
              <FieldInput
                placeholder={t('library.namePlaceholder')}
                accessibilityLabel={t('list.itemName')}
                value={editName}
                onChangeText={setEditName}
              />
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <FieldInput
                  containerStyle={{ width: '35%' }}
                  placeholder={t('list.quantityShort')}
                  accessibilityLabel={t('a11y.quantity')}
                  value={editQuantity}
                  onChangeText={setEditQuantity}
                  keyboardType="decimal-pad"
                />
                <FieldInput
                  containerStyle={{ flex: 1 }}
                  placeholder={t('list.unit')}
                  accessibilityLabel={t('list.unit')}
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
        trackId="shopping_list.confirm_dialog"
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

function GroupGap() {
  return <View style={{ height: 14 }} />;
}

/** An empty or failed list: an icon, a heading, a line, and the one thing to do next, on a tile. */
function StateTile({
  icon,
  title,
  body,
  action,
}: {
  icon: ComponentProps<typeof Ionicons>['name'];
  title: string;
  body: string;
  action: ReactNode;
}) {
  const { colors } = useThemePreference();
  return (
    <Tile padding={24} style={{ alignItems: 'center', gap: 12 }}>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 56,
          height: 56,
          borderRadius: 16,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.backgroundElement,
        }}
      >
        <Ionicons name={icon} size={26} color={colors.textSecondary} />
      </View>
      <Text variant="h2" align="center">
        {title}
      </Text>
      <Text variant="bodySmall" tone="muted" align="center">
        {body}
      </Text>
      <View style={{ marginTop: 4 }}>{action}</View>
    </Tile>
  );
}
