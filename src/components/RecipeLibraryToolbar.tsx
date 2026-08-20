import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { LibraryLayoutToggle } from '@/components/LibraryLayoutToggle';
import type { LibraryLayout } from '@/hooks/useLibraryLayout';
import { useThemePreference } from '@/hooks/useThemePreference';
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
        className="flex-row items-center rounded-[20px] px-3.5"
        style={{
          backgroundColor: colors.frosted,
          borderWidth: 1,
          borderColor: colors.frostedBorder,
        }}
      >
        <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
        <TextInput
          className="flex-1 px-3 py-3.5 text-base"
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
            hitSlop={8}
            className="active:opacity-70"
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
            className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
            style={{
              backgroundColor: favoritesOnly ? colors.primary : inactiveChipBg,
            }}
            accessibilityRole="button"
            accessibilityState={{ selected: favoritesOnly }}
            accessibilityLabel={t('library.favoritesFilter')}
          >
            <Ionicons
              name={favoritesOnly ? 'heart' : 'heart-outline'}
              size={14}
              color={favoritesOnly ? '#fff' : colors.primary}
            />
            <Text
              className="text-sm font-semibold"
              style={{ color: favoritesOnly ? '#fff' : colors.text }}
            >
              {t('library.favorites')}
            </Text>
          </Pressable>
        ) : null}

        <Pressable
          onPress={() => setFiltersOpen((open) => !open)}
          className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
          style={{
            backgroundColor: filtersOpen || filtersActive ? colors.primarySoft : inactiveChipBg,
          }}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          accessibilityLabel={t('library.toggleFilters')}
        >
          <Ionicons name="options-outline" size={14} color={colors.primary} />
          <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
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
          <Text
            className={`text-xs ${isSearchPending ? 'opacity-60' : ''}`}
            style={{ color: colors.textSecondary }}
          >
            {t(resultCount === 1 ? 'library.recipeCountOne' : 'library.recipeCountOther', {
              count: resultCount,
            })}
          </Text>
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
                  className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
                  style={{
                    backgroundColor: active ? colors.primary : inactiveChipBg,
                  }}
                >
                  <Ionicons
                    name={option.icon as keyof typeof Ionicons.glyphMap}
                    size={14}
                    color={active ? '#fff' : colors.primary}
                  />
                  <Text
                    className="text-sm font-semibold"
                    style={{ color: active ? '#fff' : colors.text }}
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
                  className="text-xs font-semibold uppercase tracking-wide"
                  style={{ color: colors.textSecondary }}
                >
                  {t('library.tags')}
                </Text>
                {selectedTags.length > 0 && onClearTags ? (
                  <Pressable onPress={onClearTags} hitSlop={8} className="active:opacity-70">
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
                      className="rounded-[14px] px-3.5 py-2 active:opacity-80"
                      style={{
                        backgroundColor: active ? colors.primary : inactiveChipBg,
                      }}
                    >
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: active ? '#fff' : colors.text }}
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
                className="rounded-[14px] px-3.5 py-2 active:opacity-80"
                style={{
                  backgroundColor: selectedCollectionId == null ? colors.primary : inactiveChipBg,
                }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: selectedCollectionId == null ? '#fff' : colors.text }}
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
                    className="flex-row items-center gap-1.5 rounded-[14px] px-3.5 py-2 active:opacity-80"
                    style={{
                      backgroundColor: active ? colors.primary : inactiveChipBg,
                    }}
                  >
                    <Ionicons
                      name="folder-outline"
                      size={14}
                      color={active ? '#fff' : colors.primary}
                    />
                    <Text
                      className="text-sm font-semibold"
                      style={{ color: active ? '#fff' : colors.text }}
                    >
                      {collection.name}
                    </Text>
                    {onManageCollection ? (
                      <Pressable
                        onPress={(e) => {
                          e.stopPropagation?.();
                          onManageCollection(collection.id);
                        }}
                        hitSlop={8}
                        accessibilityLabel={t('library.manageCollection', {
                          name: collection.name,
                        })}
                      >
                        <Ionicons
                          name="ellipsis-horizontal"
                          size={14}
                          color={active ? '#fff' : colors.textSecondary}
                        />
                      </Pressable>
                    ) : null}
                  </Pressable>
                );
              })}
              {onCreateCollection ? (
                <Pressable
                  onPress={onCreateCollection}
                  className="flex-row items-center gap-1 rounded-[14px] border px-3.5 py-2 active:opacity-80"
                  style={{ borderColor: colors.frostedBorder, backgroundColor: inactiveChipBg }}
                >
                  <Ionicons name="add" size={14} color={colors.primary} />
                  <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
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
