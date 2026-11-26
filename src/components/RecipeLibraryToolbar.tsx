import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View, type StyleProp, type ViewStyle } from 'react-native';

import { TextInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, MIN_TOUCH, Radii } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import {
  RECIPE_QUICK_FILTERS,
  RECIPE_SORT_OPTIONS,
  type RecipeQuickFilter,
  type RecipeSortKey,
} from '@shared/lib/recipeListQuery';
import { normalizeSocialUrl } from '@shared/lib/platformUrls';
import { translateRecipeTag } from '@shared/lib/recipeTags';

export type LibraryCollectionChip = {
  id: string;
  name: string;
};

/** The page's side gutter: chip rows scroll out to the screen's edges past it. */
const GUTTER = 16;

/**
 * The bar at the top of the Library (the web's Snap bar, phone size): typing searches the Library, and the photo
 * button opens Snap.
 */
export function LibrarySearchBar({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();
  const [focused, setFocused] = useState(false);
  const typing = value.trim().length > 0;
  // A pasted recipe link is a Snap, not a search (the web's Snap bar does the same).
  const link = typing ? normalizeSocialUrl(value) : null;
  const snapLink = () => {
    if (!link) return;
    onChange('');
    router.push({ pathname: '/add', params: { url: link } });
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        height: 52,
        borderRadius: Radii.inner,
        borderWidth: HAIRLINE,
        borderColor: focused ? colors.primary : colors.border,
        backgroundColor: colors.surface,
        paddingStart: 14,
        paddingEnd: 4,
        gap: 8,
      }}
    >
      <KitIcon icon={typing ? 'search-outline' : 'link-outline'} color={colors.textSecondary} size={20} />
      <TextInput
        accessibilityLabel={t('a11y.searchRecipes')}
        className="pinch-plain-focus"
        style={[
          type.font('body', 'regular'),
          { flex: 1, minWidth: 0, fontSize: 16, color: colors.text, textAlign: type.rtl ? 'right' : 'left' },
        ]}
        placeholder={t('web.snapBar.placeholderShort')}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChange}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType={link ? 'go' : 'search'}
        onSubmitEditing={snapLink}
      />
      {link ? (
        <Button size="sm" trackId="library.snap_bar.snap" onPress={snapLink} style={{ marginEnd: 2 }}>
          {t('web.snapBar.action')}
        </Button>
      ) : null}
      {value.length > 0 && !link ? (
        <IconButton
          icon="close-circle"
          label={t('library.clearSearch')}
          trackId="library.search.clear"
          iconSize={20}
          onPress={() => onChange('')}
        />
      ) : null}
      <IconButton
        icon="image-outline"
        label={t('web.snapBar.addPhoto')}
        trackId="library.snap_bar.photo"
        onPress={() => router.push('/add')}
      />
    </View>
  );
}

/** A horizontal row of chips reaching the screen's edges. */
function ChipRow({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      keyboardShouldPersistTaps="handled"
      accessibilityLabel={label}
      style={{ marginHorizontal: -GUTTER, flexGrow: 0 }}
      contentContainerStyle={{ gap: 8, paddingHorizontal: GUTTER, alignItems: 'center' }}
    >
      {children}
    </ScrollView>
  );
}

/**
 * A collection as a small chip that also takes a long press (manage it), which the kit's Chip doesn't: the same
 * look as `<Chip size="sm">`.
 */
function CollectionChip({
  name,
  selected,
  onPress,
  onManage,
  manageLabel,
}: {
  name: string;
  selected: boolean;
  onPress: () => void;
  onManage?: () => void;
  manageLabel: string;
}) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const fg = selected ? colors.background : colors.text;
  return (
    <Pressable
      trackId="library.collection.select"
      onPress={onPress}
      onLongPress={onManage}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      accessibilityLabel={name}
      // The manage button isn't reachable inside an accessible chip on iOS, so it is an action too.
      accessibilityActions={onManage ? [{ name: 'manage', label: manageLabel }] : undefined}
      onAccessibilityAction={(event) => {
        if (event.nativeEvent.actionName === 'manage') onManage?.();
      }}
      style={({ pressed }) => [
        {
          flexDirection: 'row',
          alignItems: 'center',
          gap: 6,
          height: MIN_TOUCH,
          maxWidth: 220,
          paddingHorizontal: 14,
          borderRadius: Radii.pill,
          borderWidth: HAIRLINE,
          borderColor: selected ? colors.text : colors.border,
          backgroundColor: selected ? colors.text : pressed ? colors.backgroundElement : 'transparent',
        },
      ]}
    >
      <KitIcon icon="folder-outline" color={fg} size={14} />
      <Text
        numberOfLines={1}
        color={fg}
        style={{ ...type.font('body', 'semibold'), fontSize: 13, lineHeight: 17, flexShrink: 1 }}
      >
        {name}
      </Text>
    </Pressable>
  );
}

interface RecipeLibraryToolbarProps {
  sort: RecipeSortKey;
  onSortChange: (value: RecipeSortKey) => void;
  quick: RecipeQuickFilter[];
  onToggleQuick: (filter: RecipeQuickFilter) => void;
  /** "All": turns the one-tap filters, favorites and cook tonight off. */
  onShowAll: () => void;
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
  onManageCollection?: (id: string) => void;
  onCreateCollection?: () => void;
  style?: StyleProp<ViewStyle>;
}

/**
 * Everything that narrows the list, under the "Your recipes" heading (as on the web's LibraryToolbar): the one-tap
 * chips (All, Under 30 min, Veggie, From TikTok, Never cooked, Favorites, Cook tonight), the fridge match, the
 * cookbook and Filters, which opens a tile with sorting and tags; then the collections.
 */
export function RecipeLibraryToolbar({
  sort,
  onSortChange,
  quick,
  onToggleQuick,
  onShowAll,
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
  onManageCollection,
  onCreateCollection,
  style,
}: RecipeLibraryToolbarProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const type = useTypography();

  const filtersActive = sort !== 'newest' || selectedTags.length > 0;
  const activeCount = (sort !== 'newest' ? 1 : 0) + selectedTags.length;
  const [filtersOpen, setFiltersOpen] = useState(filtersActive);
  const showingAll = quick.length === 0 && !favoritesOnly && !cookTonight;
  const selectedCollection = collections.find((c) => c.id === selectedCollectionId);

  return (
    <View style={[{ gap: 12 }, style]}>
      <ChipRow label={t('web.library.quickFilters')}>
        <Chip selected={showingAll} trackId="library.filter.all" onPress={onShowAll}>
          {t('web.library.filterAll')}
        </Chip>
        {RECIPE_QUICK_FILTERS.map((filter) => (
          <Chip
            key={filter}
            selected={quick.includes(filter)}
            trackId={`library.quick.${filter}`}
            onPress={() => onToggleQuick(filter)}
          >
            {t(`web.library.quick.${filter}`)}
          </Chip>
        ))}
        {onToggleFavorites ? (
          <Chip
            selected={favoritesOnly}
            icon={favoritesOnly ? 'heart' : 'heart-outline'}
            trackId="library.favorites.toggle"
            accessibilityLabel={t('library.favoritesFilter')}
            onPress={onToggleFavorites}
          >
            {t('library.favorites')}
          </Chip>
        ) : null}
        {onToggleCookTonight ? (
          <Chip
            selected={cookTonight}
            icon="flame-outline"
            trackId="library.cook_tonight.toggle"
            onPress={onToggleCookTonight}
          >
            {t('library.cookTonight')}
          </Chip>
        ) : null}
        <View style={{ width: HAIRLINE, height: 24, backgroundColor: colors.border, marginHorizontal: 4 }} />
        {onFridgeMatch ? (
          <Chip icon="nutrition-outline" trackId="library.fridge_match" onPress={onFridgeMatch}>
            {t('pantry.cook.button')}
          </Chip>
        ) : null}
        <Chip
          icon="print-outline"
          trackId="library.cookbook.open"
          accessibilityLabel={t('library.makeCookbook')}
          onPress={() => router.push('/cookbook')}
        >
          {t('cookbook.title')}
        </Chip>
        <Pressable
          trackId="library.filter.open"
          onPress={() => setFiltersOpen((open) => !open)}
          accessibilityRole="button"
          accessibilityState={{ expanded: filtersOpen }}
          accessibilityLabel={t('library.toggleFilters')}
          accessibilityValue={filtersActive ? { text: t('a11y.filtersApplied') } : undefined}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            gap: 8,
            height: MIN_TOUCH,
            paddingHorizontal: 16,
            borderRadius: Radii.pill,
            borderWidth: HAIRLINE,
            borderColor: filtersActive ? colors.text : colors.border,
            backgroundColor: filtersActive ? colors.text : pressed || filtersOpen ? colors.backgroundElement : 'transparent',
          })}
        >
          <KitIcon icon="options-outline" color={filtersActive ? colors.background : colors.text} size={16} />
          <Text
            numberOfLines={1}
            color={filtersActive ? colors.background : colors.text}
            style={{ ...type.font('body', 'semibold'), fontSize: 14, lineHeight: 18 }}
          >
            {t('library.filter')}
          </Text>
          {activeCount > 0 ? (
            <View
              style={{
                minWidth: 20,
                height: 20,
                borderRadius: 10,
                paddingHorizontal: 5,
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.background,
              }}
            >
              <Text color={colors.text} style={{ ...type.font('body', 'bold'), fontSize: 12, lineHeight: 14 }}>
                {activeCount}
              </Text>
            </View>
          ) : null}
        </Pressable>
      </ChipRow>

      {cookTonight ? (
        <Text variant="caption" tone="muted">
          {t('library.cookTonightRule')}
        </Text>
      ) : null}

      {filtersOpen ? (
        <Tile padding={18} style={{ gap: 18 }}>
          <View style={{ gap: 10 }}>
            <Text variant="h3">{t('web.library.sortBy')}</Text>
            <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
              {RECIPE_SORT_OPTIONS.map((option) => (
                <Chip
                  key={option.key}
                  kind="radio"
                  size="sm"
                  selected={sort === option.key}
                  trackId={`library.sort.${option.key}`}
                  accessibilityLabel={t('a11y.sortBy', { option: t(`library.sort.${option.key}`) })}
                  onPress={() => onSortChange(option.key)}
                >
                  {t(`library.sort.${option.key}`)}
                </Chip>
              ))}
            </View>
          </View>
          {availableTags.length > 0 ? (
            <View style={{ gap: 10 }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <Text variant="h3">{t('library.tags')}</Text>
                {selectedTags.length > 0 && onClearTags ? (
                  <Button
                    variant="link"
                    trackId="library.tags.clear"
                    accessibilityLabel={t('a11y.clearTags')}
                    onPress={onClearTags}
                  >
                    {t('common.clear')}
                  </Button>
                ) : null}
              </View>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                {availableTags.map((tag) => (
                  <Chip
                    key={tag}
                    size="sm"
                    selected={selectedTags.includes(tag)}
                    trackId="library.tag.toggle"
                    onPress={() => onToggleTag?.(tag)}
                  >
                    {translateRecipeTag(tag, t)}
                  </Chip>
                ))}
              </View>
            </View>
          ) : null}
        </Tile>
      ) : null}

      <View style={{ gap: 8 }}>
        <TileLabel accessibilityRole="header">{t('library.collections')}</TileLabel>
        <ChipRow label={t('library.collections')}>
          <Chip
            size="sm"
            selected={selectedCollectionId == null}
            trackId="library.collection.all"
            accessibilityLabel={t('a11y.allCollections')}
            onPress={() => onSelectCollection?.(null)}
          >
            {t('library.allCollections')}
          </Chip>
          {collections.map((collection) => {
            const active = selectedCollectionId === collection.id;
            return (
              <CollectionChip
                key={collection.id}
                name={collection.name}
                selected={active}
                onPress={() => onSelectCollection?.(active ? null : collection.id)}
                onManage={onManageCollection ? () => onManageCollection(collection.id) : undefined}
                manageLabel={t('library.manageCollection', { name: collection.name })}
              />
            );
          })}
          {selectedCollection && onManageCollection ? (
            <IconButton
              icon="ellipsis-horizontal"
              label={t('library.manageCollection', { name: selectedCollection.name })}
              trackId="library.collection.manage"
              iconSize={18}
              onPress={() => onManageCollection(selectedCollection.id)}
              style={{ borderRadius: Radii.pill, borderWidth: HAIRLINE, borderColor: colors.border }}
            />
          ) : null}
          {onCreateCollection ? (
            <Chip
              size="sm"
              icon="add"
              trackId="library.collection.create"
              accessibilityLabel={t('library.newCollection')}
              onPress={onCreateCollection}
              style={{ borderStyle: 'dashed' }}
            >
              {t('library.new')}
            </Chip>
          ) : null}
        </ChipRow>
      </View>
    </View>
  );
}
