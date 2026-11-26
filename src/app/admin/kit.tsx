import { useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { AdminOnly } from '@/components/admin/AdminOnly';
import { CookieMark } from '@/components/CookieMark';
import { Screen } from '@/components/Screen';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { PageHeader } from '@/components/ui/PageHeader';
import { PinchLogo } from '@/components/ui/PinchLogo';
import { SegmentedControl } from '@/components/ui/SegmentedControl';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { FactTile, PhotoTile, StatTile, Tile, TileBadge, TileLabel } from '@/components/ui/Tile';
import { CreditsPill, TopBar } from '@/components/ui/TopBar';
import { usePhotoColors } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';

/** A photo to judge the photo tile by: a public recipe image would need the network, so the app icon stands in. */
const PHOTO = require('@/assets/images/icon.png');

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={{ gap: 12 }}>
      <TileLabel accessibilityRole="header">{title}</TileLabel>
      {children}
    </View>
  );
}

/**
 * The Night Market kit on one screen (PIN-177), for us: every building block of src/components/ui/, to check on a
 * phone in each theme pack, light and dark, left-to-right and right-to-left. Section names are English like the
 * other admin pages; the samples follow the app language, since direction is part of what it checks.
 */
export default function AdminKitScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const photo = usePhotoColors();
  const [filter, setFilter] = useState<'all' | 'favorites' | 'tonight'>('all');
  const [measure, setMeasure] = useState<'spoons' | 'grams'>('spoons');
  const [layout, setLayout] = useState<'grid' | 'list'>('grid');
  const [servings, setServings] = useState(4);
  const [busy, setBusy] = useState(false);

  return (
    <AdminOnly>
      <Screen edges={['left', 'right', 'bottom']}>
        <ScrollView contentContainerStyle={{ padding: 20, gap: 28 }}>
          <Section title="Top bar">
            <TopBar />
            <TopBar credits={12} />
            <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
              <PinchLogo size="sm" />
              <PinchLogo wordmark={false} />
              <CreditsPill credits={1} onPress={() => {}} />
            </View>
          </Section>

          <Section title="Page header">
            <PageHeader
              title={t('tabs.library')}
              subtitle={t('snap.subtitle')}
              actions={<IconButton variant="tile" icon="share-outline" label={t('recipe.share')} trackId="kit.share" />}
            />
          </Section>

          <Section title="Type">
            <Tile padding={24} style={{ gap: 10 }}>
              <Text variant="number">42</Text>
              <Text variant="h1">{t('tabs.library')}</Text>
              <Text variant="h2">{t('recipe.ingredients')}</Text>
              <Text variant="h3">{t('snap.title')}</Text>
              <Text>{t('snap.subtitle')}</Text>
              <Text variant="bodySmall">{t('snap.subtitle')}</Text>
              <Text variant="caption" tone="muted">
                {t('library.cookTonightRule')}
              </Text>
              <TileLabel>{t('recipe.servings')}</TileLabel>
              <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
                <TileBadge>{t('library.cookTonight')}</TileBadge>
                <Text weight="bold" tone="primary">
                  {t('recipe.remix')}
                </Text>
                <Text weight="bold" tone="accent">
                  {t('recipe.translate')}
                </Text>
              </View>
            </Tile>
          </Section>

          <Section title="Buttons">
            <Tile padding={20} style={{ gap: 12 }}>
              {(['lg', 'md', 'sm'] as const).map((size) => (
                <View key={size} style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
                  <Button size={size} trackId="kit.primary">
                    {t('web.snapBar.action')}
                  </Button>
                  <Button size={size} variant="secondary" icon="sparkles-outline" trackId="kit.secondary">
                    {t('recipe.remix')}
                  </Button>
                  <Button size={size} variant="outline" trackId="kit.outline">
                    {t('recipe.cookedAction')}
                  </Button>
                  <Button size={size} variant="ghost" trackId="kit.ghost">
                    {t('common.cancel')}
                  </Button>
                  <Button size={size} variant="danger" trackId="kit.danger">
                    {t('common.delete')}
                  </Button>
                  <Button size={size} disabled trackId="kit.disabled">
                    {t('common.save')}
                  </Button>
                </View>
              ))}
              <Button
                size="lg"
                fullWidth
                busy={busy}
                iconEnd="chevron-forward"
                trackId="kit.busy"
                onPress={() => {
                  setBusy(true);
                  setTimeout(() => setBusy(false), 1500);
                }}
              >
                {t('web.cook.cookMode')}
              </Button>
              <Button variant="link" iconEnd="open-outline" trackId="kit.link">
                {t('web.recipe.viewOriginal')}
              </Button>
            </Tile>
          </Section>

          <Section title="Icon buttons">
            <Tile padding={20} style={{ gap: 12 }}>
              <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
                <IconButton icon="heart-outline" label={t('library.favorites')} trackId="kit.icon.ghost" />
                <IconButton icon="ellipsis-horizontal" label={t('a11y.moreOptions')} trackId="kit.icon.ghost2" />
                <IconButton variant="tile" icon="share-outline" label={t('recipe.share')} trackId="kit.icon.tile" />
                <IconButton
                  variant="tile"
                  icon="heart"
                  color={colors.danger}
                  selected
                  label={t('library.favorites')}
                  trackId="kit.icon.selected"
                />
                <IconButton variant="tile" icon="chevron-forward" label={t('common.back')} trackId="kit.icon.dir" />
              </View>
            </Tile>
          </Section>

          <Section title="Chips">
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              <Chip selected={filter === 'all'} kind="radio" trackId="kit.chip.all" onPress={() => setFilter('all')}>
                {t('library.allCollections')}
              </Chip>
              <Chip
                selected={filter === 'favorites'}
                kind="radio"
                icon={filter === 'favorites' ? 'heart' : 'heart-outline'}
                trackId="kit.chip.favorites"
                onPress={() => setFilter('favorites')}
              >
                {t('library.favorites')}
              </Chip>
              <Chip
                selected={filter === 'tonight'}
                kind="radio"
                trackId="kit.chip.tonight"
                onPress={() => setFilter('tonight')}
              >
                {t('library.cookTonight')}
              </Chip>
              <Chip size="sm" icon="funnel-outline" trackId="kit.chip.action">
                {t('pantry.cook.button')}
              </Chip>
            </ScrollView>
          </Section>

          <Section title="Segmented control and stepper">
            <Tile padding={20} style={{ gap: 14 }}>
              <SegmentedControl
                label={t('recipe.ingredients')}
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: 'spoons', label: t('measurement.spoons'), trackId: 'kit.seg.spoons' },
                  { value: 'grams', label: t('measurement.grams'), icon: 'scale-outline', trackId: 'kit.seg.grams' },
                ]}
              />
              <SegmentedControl
                label={t('tabs.library')}
                value={layout}
                onChange={setLayout}
                options={[
                  { value: 'grid', label: t('library.showGrid'), icon: 'grid-outline', iconOnly: true, trackId: 'kit.seg.grid' },
                  { value: 'list', label: t('library.showList'), icon: 'list-outline', iconOnly: true, trackId: 'kit.seg.list' },
                ]}
              />
              <SegmentedControl
                fullWidth
                kind="tabs"
                label={t('recipe.ingredients')}
                value={measure}
                onChange={setMeasure}
                options={[
                  { value: 'spoons', label: t('recipe.ingredients'), trackId: 'kit.tab.ingredients' },
                  { value: 'grams', label: t('recipe.instructions'), trackId: 'kit.tab.steps' },
                ]}
              />
              <Stepper
                label={t('recipe.servings')}
                value={servings}
                onChange={setServings}
                min={1}
                max={12}
                decreaseLabel={t('recipe.decreaseServings')}
                increaseLabel={t('recipe.increaseServings')}
                spokenValue={t('cookbook.servings', { count: servings })}
                trackId="kit.servings"
              />
            </Tile>
          </Section>

          <Section title="Tiles">
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <StatTile style={{ flex: 1 }} label={t('tabs.list')} value={7} />
              <StatTile style={{ flex: 1 }} tone="element" label={t('recipe.servings')} value={servings} />
            </View>
            <Tile tone="primary" padding={20} style={{ gap: 12 }}>
              <Text variant="h2" tone="onPrimary">
                {t('snap.title')}
              </Text>
              <Text tone="onPrimary">{t('snap.subtitle')}</Text>
            </Tile>
            <Tile size="md" padding={20} onPress={() => {}} trackId="kit.tile.press" style={{ gap: 6 }}>
              <TileLabel>{t('library.cookTonight')}</TileLabel>
              <Text variant="h3">{t('cookAlong.title')}</Text>
            </Tile>
            <Tile tone="element" size="sm" padding={16}>
              <Text variant="bodySmall">{t('library.cookTonightRule')}</Text>
            </Tile>
            <View style={{ flexDirection: 'row', gap: 8 }}>
              <FactTile style={{ flex: 1 }} value="25m" label={t('recipeEditor.fields.time')} />
              <FactTile style={{ flex: 1 }} value="540" label={t('recipeEditor.fields.calories')} />
              <FactTile style={{ flex: 1 }} value="$12" label={t('recipeEditor.fields.cost')} />
            </View>
          </Section>

          <Section title="Photo tiles">
            <PhotoTile src={PHOTO} style={{ aspectRatio: 4 / 3 }} contentStyle={{ padding: 18, gap: 8 }}>
              <View style={{ position: 'absolute', top: 12, start: 12, end: 12, flexDirection: 'row', justifyContent: 'space-between' }}>
                <IconButton variant="photo" icon="chevron-back" label={t('common.back')} trackId="kit.photo.back" />
                <IconButton variant="photo" icon="heart-outline" label={t('library.favorites')} trackId="kit.photo.fav" />
              </View>
              <TileBadge tone="photo">{t('library.cookTonight')}</TileBadge>
              <Text variant="h2" tone="onScrim">
                {t('cookAlong.title')}
              </Text>
              <Text variant="caption" tone="onScrimMuted">
                {t('library.cookTonightRule')}
              </Text>
            </PhotoTile>
            <View style={{ flexDirection: 'row', gap: 12 }}>
              <PhotoTile
                size="md"
                src={null}
                fallback={<CookieMark size={40} color={photo.onScrimMuted} />}
                style={{ flex: 1, aspectRatio: 1 }}
                contentStyle={{ padding: 14 }}
              >
                <Text variant="h3" tone="onScrim" numberOfLines={2}>
                  {t('snap.title')}
                </Text>
              </PhotoTile>
              <PhotoTile
                size="md"
                src="https://invalid.example/missing.jpg"
                fade="strong"
                fallback={<CookieMark size={40} color={photo.onScrimMuted} />}
                style={{ flex: 1, aspectRatio: 1 }}
                contentStyle={{ padding: 14 }}
              >
                <Text variant="h3" tone="onScrim" numberOfLines={2}>
                  {t('recipe.ingredients')}
                </Text>
              </PhotoTile>
            </View>
          </Section>
        </ScrollView>
      </Screen>
    </AdminOnly>
  );
}
