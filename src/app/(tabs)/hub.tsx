import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  ScrollView,
  Text,
  View,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { useTranslation } from 'react-i18next';

import { BrandHeader } from '@/components/BrandHeader';
import { LibraryLayoutToggle } from '@/components/LibraryLayoutToggle';
import { RecipeListRow } from '@/components/RecipeListRow';
import { Screen } from '@/components/Screen';
import { TextInput } from '@/components/text-input';
import { useCookingHub } from '@/hooks/useCookingHub';
import { useLibraryLayout } from '@/hooks/useLibraryLayout';
import { useThemePreference } from '@/hooks/useThemePreference';
import { recipeCardToListRecipe } from '@/lib/recipeCardMap';
import { translateRecipeTag } from '@/lib/recipeTags';

export default function CookingHubScreen() {
  const { t } = useTranslation();
  const { colors, scheme } = useThemePreference();
  const { layout, numColumns, toggleLayout } = useLibraryLayout();
  const {
    cards,
    loading,
    loadingMore,
    error,
    total,
    search,
    setSearch,
    selectedTags,
    toggleTag,
    clearTags,
    sort,
    setSort,
    availableTags,
    refresh,
    loadMore,
  } = useCookingHub();
  const isDark = scheme === 'dark';
  const inactiveChipBg = isDark ? 'rgba(40,36,48,0.6)' : 'rgba(255,255,255,0.55)';

  const listRecipes = useMemo(() => cards.map(recipeCardToListRecipe), [cards]);
  const filtersActive = selectedTags.length > 0 || sort !== 'popular';
  const [filtersOpen, setFiltersOpen] = useState(filtersActive);
  const hasQuery = Boolean(search.trim());

  const handleListScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const remaining = contentSize.height - contentOffset.y - layoutMeasurement.height;
      if (remaining < 480) loadMore();
    },
    [loadMore],
  );

  if (loading && cards.length === 0) {
    return (
      <Screen tabScreen className="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (error && cards.length === 0) {
    return (
      <Screen tabScreen className="items-center justify-center px-8">
        <View
          className="mb-5 h-16 w-16 items-center justify-center rounded-[22px]"
          style={{ backgroundColor: colors.dangerSoft }}
        >
          <Ionicons name="cloud-offline-outline" size={32} color={colors.danger} />
        </View>
        <Text className="mb-2 text-center text-xl font-bold" style={{ color: colors.text }}>
          {t('hub.loadFailedTitle')}
        </Text>
        <Text className="mb-6 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
          {error}
        </Text>
        <Pressable
          onPress={() => refresh()}
          className="rounded-3xl px-6 py-3.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-base font-bold text-white">{t('common.tryAgainAction')}</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen tabScreen className="overflow-hidden">
      <View
        className="w-full min-w-0 gap-3 px-5 pb-3"
        style={{ flexShrink: 0, maxWidth: '100%', alignSelf: 'stretch' }}
      >
        <BrandHeader title={t('hub.title')} subtitle={filtersOpen ? undefined : t('hub.subtitle')} />

        <View
          className="flex-row items-center rounded-3xl px-3.5"
          style={{
            backgroundColor: colors.frosted,
            borderWidth: 1,
            borderColor: colors.frostedBorder,
          }}
        >
          <Ionicons name="search-outline" size={18} color={colors.textSecondary} />
          <TextInput
            className="pinch-plain-focus flex-1 px-3 py-3.5 text-base"
            style={{ color: colors.text }}
            value={search}
            onChangeText={setSearch}
            placeholder={t('hub.searchPlaceholder')}
            placeholderTextColor={colors.textSecondary}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
            returnKeyType="search"
          />
          {search.length > 0 ? (
            <Pressable
              onPress={() => setSearch('')}
              hitSlop={8}
              className="active:opacity-70"
              accessibilityLabel={t('library.clearSearch')}
            >
              <Ionicons name="close-circle" size={18} color={colors.textSecondary} />
            </Pressable>
          ) : null}
        </View>

        <View className="flex-row flex-wrap items-center gap-2">
          <Pressable
            onPress={() => setFiltersOpen((open) => !open)}
            className="min-h-[44px] flex-row items-center gap-1.5 rounded-2xl px-4 active:opacity-80"
            style={{
              backgroundColor: filtersOpen || filtersActive ? colors.primarySoft : inactiveChipBg,
            }}
            accessibilityRole="button"
            accessibilityState={{ expanded: filtersOpen }}
            accessibilityLabel={t('library.toggleFilters')}
          >
            <Ionicons name="options-outline" size={16} color={colors.primary} />
            <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
              {t('library.filter')}
            </Text>
            {filtersActive ? (
              <View className="h-2 w-2 rounded-full" style={{ backgroundColor: colors.primary }} />
            ) : null}
          </Pressable>
          <View style={{ marginStart: 'auto', flexShrink: 0 }}>
            <LibraryLayoutToggle
              layout={layout}
              onToggle={toggleLayout}
              color={colors.primary}
              backgroundColor={layout === 'grid' ? colors.primarySoft : inactiveChipBg}
            />
          </View>
        </View>

        <Text className="text-xs" style={{ color: colors.textSecondary }}>
          {t((total || cards.length) === 1 ? 'library.recipeCountOne' : 'library.recipeCountOther', {
            count: total || cards.length,
          })}
        </Text>

        {filtersOpen ? (
          <View className="w-full min-w-0 gap-3">
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={{ width: '100%' }}
              contentContainerStyle={{ gap: 8, paddingEnd: 4 }}
              keyboardShouldPersistTaps="handled"
            >
              <Pressable
                onPress={() => setSort('popular')}
                className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
                style={{ backgroundColor: sort === 'popular' ? colors.primary : inactiveChipBg }}
                accessibilityRole="button"
                accessibilityState={{ selected: sort === 'popular' }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: sort === 'popular' ? '#fff' : colors.text }}
                >
                  {t('hub.sortPopular')}
                </Text>
              </Pressable>
              <Pressable
                onPress={() => setSort('newest')}
                className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
                style={{ backgroundColor: sort === 'newest' ? colors.primary : inactiveChipBg }}
                accessibilityRole="button"
                accessibilityState={{ selected: sort === 'newest' }}
              >
                <Text
                  className="text-sm font-semibold"
                  style={{ color: sort === 'newest' ? '#fff' : colors.text }}
                >
                  {t('hub.sortNewest')}
                </Text>
              </Pressable>
            </ScrollView>

            {availableTags.length > 0 ? (
              <View className="gap-1.5">
                <View className="flex-row items-center justify-between">
                  <Text
                    className="text-xs font-semibold uppercase tracking-wide"
                    style={{ color: colors.textSecondary }}
                  >
                    {t('library.tags')}
                  </Text>
                  {selectedTags.length > 0 ? (
                    <Pressable onPress={clearTags} hitSlop={8} className="active:opacity-70">
                      <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
                        {t('common.clear')}
                      </Text>
                    </Pressable>
                  ) : null}
                </View>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  style={{ width: '100%' }}
                  contentContainerStyle={{ gap: 8, paddingEnd: 4 }}
                  keyboardShouldPersistTaps="handled"
                >
                  {availableTags.map((tag) => {
                    const active = selectedTags.includes(tag);
                    return (
                      <Pressable
                        key={tag}
                        onPress={() => toggleTag(tag)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: active }}
                        className="min-h-[44px] rounded-2xl px-4 py-2.5 active:opacity-80"
                        style={{ backgroundColor: active ? colors.primary : inactiveChipBg }}
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
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FlatList
          key={`hub-${numColumns}`}
          data={listRecipes}
          keyExtractor={(item) => item.id}
          numColumns={numColumns}
          columnWrapperStyle={numColumns > 1 ? { gap: 0, marginBottom: 12 } : undefined}
          renderItem={({ item, index }) => (
            <View style={numColumns > 1 ? { flex: 1, paddingHorizontal: 6 } : undefined}>
              <RecipeListRow
                recipe={item}
                index={index}
                variant={layout === 'grid' ? 'card' : 'row'}
                onPress={() => router.push(`/hub/${item.id}`)}
              />
            </View>
          )}
          style={{ flex: 1 }}
          onScroll={handleListScroll}
          scrollEventThrottle={160}
          onEndReached={loadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={
            loadingMore ? <ActivityIndicator className="py-4" color={colors.primary} /> : null
          }
          ListEmptyComponent={
            <View className="items-center px-6 py-12">
              {filtersActive || hasQuery ? (
                <>
                  <Text className="mb-1 text-center text-base font-semibold" style={{ color: colors.text }}>
                    {t('hub.noMatches')}
                  </Text>
                  <Text className="text-center text-sm" style={{ color: colors.textSecondary }}>
                    {t('hub.noMatchesHint')}
                  </Text>
                </>
              ) : (
                <>
                  <BrandHeader
                    size="hero"
                    align="center"
                    title={t('hub.emptyTitle')}
                    subtitle={t('hub.emptyBody')}
                  />
                  <Pressable
                    className="mt-8 w-full items-center rounded-3xl py-4 active:opacity-80"
                    style={{ backgroundColor: colors.primary }}
                    onPress={() => router.push('/add')}
                  >
                    <Text className="text-base font-bold text-white">{t('hub.snapFirst')}</Text>
                  </Pressable>
                </>
              )}
            </View>
          }
          contentContainerStyle={{
            paddingHorizontal: 20,
            paddingTop: 4,
            paddingBottom: 28,
            gap: numColumns > 1 ? 0 : 12,
            flexGrow: 1,
          }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      </View>
    </Screen>
  );
}
