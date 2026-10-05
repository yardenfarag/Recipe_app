import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LibraryLayoutToggle } from '@/components/LibraryLayoutToggle';
import { TextInput } from '@/components/text-input';
import type { LibraryLayout } from '@/hooks/useLibraryLayout';
import { useThemePreference } from '@/hooks/useThemePreference';
import { CHROME_MAX_FONT_SCALE } from '@/lib/a11y';
import { RECIPE_SORT_OPTIONS, RecipeSortKey } from '@/lib/recipeListQuery';
import { translateRecipeTag } from '@/lib/recipeTags';

export type LibraryCollectionChip = {
  id: string;
  name: string;
};

interface RecipeLibraryToolbarProps {
  search: string;
  onSearchChange: (value: string) => void;
  sort: RecipeSortKey;
  onSortChange: (value: RecipeSortKey) => void;
  resultCount: number;
  isSearchPending?: boolean;
  favoritesOnly?: boolean;
  onToggleFavorites?: () => void;
  cookTonight?: boolean;
  onToggleCookTonight?: () => void;
  onFridgeMatch?: () => void;
  availableTags?: string[];
  selectedTags?: string[];
  onToggleTag?: (tag: string) => void;
  onClearTags?: () => void;
  collections?: LibraryCollectionChip[];
  selectedCollectionId?: string | null;
  onSelectCollection?: (id: string | null) => void;
  onLongPressCollection?: (id: string) => void;
  onManageCollection?: (id: string) => void;
  onCreateCollection?: () => void;
  layout?: LibraryLayout;
  onToggleLayout?: () => void;
}

export function RecipeLibraryToolbar({
  search,
  onSearchChange,
  sort,
  onSortChange,
  resultCount,
  isSearchPending,
  favoritesOnly = false,
  onToggleFavorites,
  cookTonight = false,
  onToggleCookTonight,
  onFridgeMatch,
  availableTags = [],
  selectedTags = [],
  onToggleTag,
  onClearTags,
  collections = [],
  selectedCollectionId = null,
  onSelectCollection,
  onLongPressCollection,
  onManageCollection,
  onCreateCollection,
  layout,
  onToggleLayout,
}: RecipeLibraryToolbarProps) {
  const { t } = useTranslation();
  const { colors, scheme } = useThemePreference();
  const isDark = scheme === 'dark';
  const inactiveChipBg = isDark ? 'rgba(40,36,48,0.6)' : 'rgba(255,255,255,0.55)';

  const filtersActive =
    sort !== 'newest' ||
    selectedTags.length > 0 ||
    selectedCollectionId != null;

  const [filtersOpen, setFiltersOpen] = useState(filtersActive);

  return (
    <View className="gap-3">
      <View
        className="flex-row items-center rounded-3xl px-3.5"
        style={{
          backgroundColor: colors.frosted,
          borderWidth: 1,
          borderColor: colors.frostedBorder,
        }}
      >
        <Ionicons
          name="search-outline"
          size={18}
          color={colors.textSecondary}
          accessible={false}
          importantForAccessibility="no"
        />
        <TextInput
          accessibilityLabel={t('a11y.searchRecipes')}
          className="pinch-plain-focus flex-1 px-3 py-3.5 text-base"
          style={{ color: colors.text }}
          placeholder={t('library.searchPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={search}
          onChangeText={onSearchChange}
          autoCapitalize="none"
          autoCorrect={false}
          clearButtonMode="while-editing"
          returnKeyType="search"
        />
        {search.length > 0 && (
          <Pressable
            onPress={() => onSearchChange('')}
            hitSlop={13}
            className="active:opacity-70"
            accessibilityRole="button"
            accessibilityLabel={t('library.clearSearch')}
          >
            <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
          </Pressable>
        )}
      </View>

      <View className="flex-row flex-wrap items-center gap-2">
        {onToggleFavorites ? (
          <Pressable
            onPress={onToggleFavorites}
            className="min-h-[44px] flex-row items-center gap-1.5 rounded-2xl px-4 active:opacity-80"
            style={{
              backgroundColor: favoritesOnly ? colors.primary : inactiveChipBg,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: favoritesOnly }}
            accessibilityLabel={t('library.favoritesFilter')}
          >
            <Ionicons
              name={favoritesOnly ? 'heart' : 'heart-outline'}
              size={16}
              color={favoritesOnly ? colors.onPrimary : colors.primary}
            />
            <Text
              className="text-sm font-semibold"
              style={{ color: favoritesOnly ? colors.onPrimary : colors.text }}
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
            >
              {t('library.favorites')}
            </Text>
          </Pressable>
        ) : null}

        {onToggleCookTonight ? (
          <Pressable
            onPress={onToggleCookTonight}
            className="min-h-[44px] flex-row items-center gap-1.5 rounded-2xl px-4 active:opacity-80"
            style={{
              backgroundColor: cookTonight ? colors.primary : inactiveChipBg,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: cookTonight }}
            accessibilityLabel={t('library.cookTonight')}
          >
            <Ionicons
              name={cookTonight ? 'moon' : 'moon-outline'}
              size={16}
              color={cookTonight ? colors.onPrimary : colors.primary}
            />
            <Text
              className="text-sm font-semibold"
              style={{ color: cookTonight ? colors.onPrimary : colors.text }}
              maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
            >
              {t('library.cookTonight')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setFiltersOpen((open) => !open)}
          className="min-h-[44px] flex-row items-center gap-1.5 rounded-2xl px-4 active:opacity-80"
          style={{
            backgroundColor: filtersOpen || filtersActive ? colors.primarySoft : inactiveChipBg,
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          accessibilityLabel={t('library.toggleFilters')}
          accessibilityValue={filtersActive ? { text: t('a11y.filtersApplied') } : undefined}
        >
          <Ionicons name="options-outline" size={16} color={colors.primary} />
          <Text
            className="text-sm font-semibold"
            style={{ color: colors.primary }}
            maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
          >
            {t('library.filter')}
          </Text>
          {filtersActive ? (
            <View
              className="h-2 w-2 rounded-full"
              style={{ backgroundColor: colors.primary }}
            />
          ) : null}
        </Pressable>

        <View
          className="flex-row items-center gap-2"
          style={{ marginStart: 'auto', flexShrink: 0 }}
        >
          {onFridgeMatch ? (
            <Pressable
              onPress={onFridgeMatch}
              className="h-11 w-11 items-center justify-center rounded-2xl active:opacity-80"
              style={{ backgroundColor: inactiveChipBg }}
              accessibilityRole="button"
              accessibilityLabel={t('library.fridgeMatch')}
            >
              <Ionicons name="nutrition-outline" size={20} color={colors.primary} />
            </Pressable>
          ) : null}
          {layout && onToggleLayout ? (
            <LibraryLayoutToggle
              layout={layout}
              onToggle={onToggleLayout}
              color={colors.primary}
              backgroundColor={layout === 'grid' ? colors.primarySoft : inactiveChipBg}
            />
          ) : null}
        </View>
      </View>

      {cookTonight ? (
        <Text className="text-xs leading-4" style={{ color: colors.textSecondary }}>
          {t('library.cookTonightRule')}
        </Text>
      ) : null}

      <Text
        className={`text-xs ${isSearchPending ? 'opacity-60' : ''}`}
        style={{ color: colors.textSecondary }}
        accessibilityLiveRegion="polite"
      >
        {t(resultCount === 1 ? 'library.recipeCountOne' : 'library.recipeCountOther', {
          count: resultCount,
        })}
      </Text>

      {filtersOpen ? (
        <View className="gap-3">
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ gap: 8, paddingEnd: 4 }}
            keyboardShouldPersistTaps="handled"
          >
            {RECIPE_SORT_OPTIONS.map((option) => {
              const active = sort === option.key;
              return (
                <Pressable
                  key={option.key}
                  onPress={() => onSortChange(option.key)}
                  accessibilityRole="button"
                  accessibilityState={{ selected: active }}
                  accessibilityLabel={t('a11y.sortBy', {
                    option: t(`library.sort.${option.key}`),
                  })}
                  className="min-h-[44px] flex-row items-center gap-1.5 rounded-2xl px-4 active:opacity-80"
                  style={{
                    backgroundColor: active ? colors.primary : inactiveChipBg,
                  }}
                >
                  <Ionicons
                    name={option.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={active ? colors.onPrimary : colors.primary}
                  />
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: active ? colors.onPrimary : colors.text }}
                    maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                  >
                    {t(`library.sort.${option.key}`)}
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>

          {availableTags.length > 0 && (
            <View className="gap-1.5">
              <View className="flex-row items-center justify-between">
                <Text
                  accessibilityRole="header"
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: colors.textSecondary }}
                >
                  {t('library.tags')}
                </Text>
                {selectedTags.length > 0 && onClearTags ? (
                  <Pressable
                    onPress={onClearTags}
                    hitSlop={12}
                    className="active:opacity-70"
                    accessibilityRole="button"
                    accessibilityLabel={t('a11y.clearTags')}
                  >
                    <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                      {t('common.clear')}
                    </Text>
                  </Pressable>
                ) : null}
              </View>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={{ gap: 8, paddingEnd: 4 }}
                keyboardShouldPersistTaps="handled"
              >
                {availableTags.map((tag) => {
                  const active = selectedTags.includes(tag);
                  return (
                    <Pressable
                      key={tag}
                      onPress={() => onToggleTag?.(tag)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: active }}
                      className="min-h-[44px] rounded-2xl px-4 py-2.5 active:opacity-80"
                      style={{
                        backgroundColor: active ? colors.primary : inactiveChipBg,
                      }}
                    >
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: active ? colors.onPrimary : colors.text }}
                        maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                      >
                        {translateRecipeTag(tag, t)}
                      </Text>
                    </Pressable>
                  );
                })}
              </ScrollView>
            </View>
          )}

          <View className="gap-1.5">
            <Text
              accessibilityRole="header"
              className="text-xs font-semibold uppercase tracking-wide"
              style={{ color: colors.textSecondary }}
            >
              {t('library.collections')}
            </Text>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={{ gap: 8, paddingEnd: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={() => onSelectCollection?.(null)}
                accessibilityRole="button"
                accessibilityState={{ selected: selectedCollectionId == null }}
                accessibilityLabel={t('a11y.allCollections')}
                className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
                style={{
                  backgroundColor: selectedCollectionId == null ? colors.primary : inactiveChipBg,
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: selectedCollectionId == null ? colors.onPrimary : colors.text }}
                  maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                >
                  {t('library.allCollections')}
                </Text>
              </Pressable>
              {collections.map((collection) => {
                const active = selectedCollectionId === collection.id;
                return (
                  <Pressable
                    key={collection.id}
                    onPress={() => onSelectCollection?.(active ? null : collection.id)}
                    onLongPress={() => onLongPressCollection?.(collection.id)}
                    accessibilityRole="button"
                    accessibilityState={{ selected: active }}
                    accessibilityLabel={collection.name}
                    // The nested manage button isn't reachable inside an accessible chip on
                    // iOS, so expose it as a custom action too.
                    accessibilityActions={
                      onManageCollection || onLongPressCollection
                        ? [
                            {
                              name: 'manage',
                              label: t('library.manageCollection', { name: collection.name }),
                            },
                          ]
                        : undefined
                    }
                    onAccessibilityAction={(event) => {
                      if (event.nativeEvent.actionName !== 'manage') return;
                      if (onManageCollection) onManageCollection(collection.id);
                      else onLongPressCollection?.(collection.id);
                    }}
                    className="min-h-[44px] flex-row items-center gap-1.5 rounded-2xl px-4 active:opacity-80"
                    style={{
                      backgroundColor: active ? colors.primary : inactiveChipBg,
                    }}
                  >
                    <Ionicons
                      name="folder-outline"
                      size={14}
                      color={active ? colors.onPrimary : colors.primary}
                    />
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: active ? colors.onPrimary : colors.text }}
                      maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                    >
                      {collection.name}
                    </Text>
                    {onManageCollection ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onManageCollection(collection.id);
                        }}
                        hitSlop={12}
                        accessibilityRole="button"
                        accessibilityLabel={t('library.manageCollection', {
                          name: collection.name,
                        })}
                      >
                        <Ionicons
                          name="ellipsis-horizontal"
                          size={14}
                          color={active ? colors.onPrimary : colors.textSecondary}
                        />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })}
              {onCreateCollection ? (
                <Pressable
                  onPress={onCreateCollection}
                  accessibilityRole="button"
                  accessibilityLabel={t('library.newCollection')}
                  className="min-h-[44px] flex-row items-center gap-1 rounded-2xl border px-4 active:opacity-80"
                  style={{ borderColor: colors.frostedBorder, backgroundColor: inactiveChipBg }}
                >
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: colors.primary }}
                    maxFontSizeMultiplier={CHROME_MAX_FONT_SCALE}
                  >
                    {t('library.new')}
                  </Text>
                </Pressable>
              ) : null}
            </ScrollView>
          </View>
        </View>
      ) : null}
    </View>
  );
}
