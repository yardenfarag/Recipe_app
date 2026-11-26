import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Alert, Platform, View } from 'react-native';

import { PantryBadgeIcon, PantrySignInPrompt } from '@/components/pantry/PantryParts';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { FieldInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge } from '@/components/ui/Tile';
import { KitIcon, Radii } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useKitchenProfile } from '@/hooks/useKitchenProfile';
import { usePantry } from '@/hooks/usePantry';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { daysSinceLastScan, pantryWhen } from '@/lib/pantryHelpers';
import { PANTRY_STALE_DAYS, daysSince, lastScannedByPlace } from '@shared/lib/pantry';
import { shoppingAisleForName } from '@shared/lib/shoppingAisles';
import { deletePantryItems, movePantryItem, upsertPantryItems } from '@shared/lib/supabase/pantry';
import { showToast } from '@shared/lib/toast';
import { PANTRY_PLACES, type PantryItem, type PantryPlace } from '@shared/types/pantry';

const UNDO_MS = 6000;

/**
 * Pantry (PIN-181): what's at home, one tile per place, filled by photographing the fridge and cupboards
 * (`/pantry/scan`) or typed in. The staples ("Always have", kept on the kitchen profile) live here too. Shopping lists
 * skip what's here, and "What can I cook?" ranks the Library by it. Account only.
 */
export default function PantryScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useThemePreference();
  const { user, loading: authLoading } = useAuth();
  const { items, status, reload, replace } = usePantry(false);
  const kitchen = useKitchenProfile();
  const [draft, setDraft] = useState('');
  const [draftPlace, setDraftPlace] = useState<PantryPlace>('fridge');
  const [adding, setAdding] = useState(false);
  const [stapleDraft, setStapleDraft] = useState('');
  const [undo, setUndo] = useState<PantryItem | null>(null);
  const undoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const itemsRef = useRef(items);
  itemsRef.current = items;

  useFocusEffect(
    useCallback(() => {
      if (user) void reload();
    }, [user, reload]),
  );

  useEffect(
    () => () => {
      if (undoTimer.current) clearTimeout(undoTimer.current);
    },
    [],
  );

  const byPlace = useMemo(() => {
    const map: Record<PantryPlace, PantryItem[]> = { fridge: [], freezer: [], cupboard: [], other: [] };
    for (const item of items) map[item.place]?.push(item);
    for (const place of PANTRY_PLACES) {
      map[place].sort((a, b) => a.name.localeCompare(b.name, i18n.language));
    }
    return map;
  }, [items, i18n.language]);
  const scannedAt = useMemo(() => lastScannedByPlace(items), [items]);
  const sinceScan = daysSinceLastScan(items);
  const stale = sinceScan != null && sinceScan >= PANTRY_STALE_DAYS;

  if (!authLoading && !user) {
    return (
      <SettingsDetailScreen>
        <PantrySignInPrompt />
      </SettingsDetailScreen>
    );
  }

  if (authLoading || status === 'loading') {
    return (
      <SettingsDetailScreen>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} style={{ paddingVertical: 40 }} />
      </SettingsDetailScreen>
    );
  }

  if (status === 'failed') {
    return (
      <SettingsDetailScreen>
        <Tile padding={20} style={{ gap: 12 }}>
          <Text variant="bodySmall" tone="danger" accessibilityLiveRegion="polite">
            {t('pantry.loadFailed')}
          </Text>
          <Button trackId="pantry.retry" variant="secondary" icon="refresh" onPress={() => void reload()}>
            {t('common.tryAgainAction')}
          </Button>
        </Tile>
      </SettingsDetailScreen>
    );
  }

  const userId = user!.id;

  function startUndo(item: PantryItem) {
    if (undoTimer.current) clearTimeout(undoTimer.current);
    setUndo(item);
    undoTimer.current = setTimeout(() => setUndo(null), UNDO_MS);
  }

  async function removeItem(item: PantryItem) {
    const before = itemsRef.current;
    replace(before.filter((row) => row.id !== item.id));
    announce(t('pantry.removed', { name: item.name }));
    startUndo(item);
    try {
      await deletePantryItems([item.id]);
    } catch {
      replace(before);
      setUndo(null);
      showToast(t('pantry.saveFailed'), 'error');
    }
  }

  async function undoRemove() {
    const item = undo;
    if (!item) return;
    setUndo(null);
    if (undoTimer.current) clearTimeout(undoTimer.current);
    try {
      const saved = await upsertPantryItems(userId, [
        { name: item.name, nameEn: item.nameEn, brand: item.brand, place: item.place, aisle: item.aisle, source: item.source },
      ]);
      replace([...itemsRef.current.filter((row) => !saved.some((s) => s.id === row.id)), ...saved]);
    } catch {
      showToast(t('pantry.saveFailed'), 'error');
    }
  }

  async function moveItem(item: PantryItem, place: PantryPlace) {
    const before = itemsRef.current;
    replace(before.map((row) => (row.id === item.id ? { ...row, place } : row)));
    try {
      await movePantryItem(item.id, place);
    } catch {
      replace(before);
      showToast(t('pantry.saveFailed'), 'error');
    }
  }

  function itemMenu(item: PantryItem) {
    // Web has no system action sheet; there the chip's × removes and moving isn't offered.
    if (Platform.OS === 'web') return;
    Alert.alert(item.name, item.brand || undefined, [
      ...PANTRY_PLACES.filter((place) => place !== item.place).map((place) => ({
        text: t('pantry.move', { place: t(`pantry.places.${place}`) }),
        onPress: () => void moveItem(item, place),
      })),
      { text: t('common.remove'), style: 'destructive' as const, onPress: () => void removeItem(item) },
      { text: t('common.cancel'), style: 'cancel' as const },
    ]);
  }

  async function addItem() {
    const name = draft.trim();
    if (!name || adding) return;
    setAdding(true);
    try {
      const saved = await upsertPantryItems(userId, [
        { name, place: draftPlace, aisle: shoppingAisleForName(name), source: 'manual' },
      ]);
      replace([...itemsRef.current.filter((row) => !saved.some((s) => s.id === row.id)), ...saved]);
      setDraft('');
      showToast(t('pantry.added', { name }));
    } catch {
      showToast(t('pantry.saveFailed'), 'error');
    } finally {
      setAdding(false);
    }
  }

  function addStaple() {
    const name = stapleDraft.trim();
    if (!name) return;
    kitchen.keepStaple(name);
    setStapleDraft('');
  }

  const empty = items.length === 0;

  return (
    <SettingsDetailScreen>
      {empty ? (
        <Tile padding={24} style={{ alignItems: 'center', gap: 14 }}>
          <PantryBadgeIcon icon="basket-outline" />
          <Text variant="h3" align="center">
            {t('pantry.emptyTitle')}
          </Text>
          <Text variant="bodySmall" tone="muted" align="center">
            {t('pantry.emptyBody')}
          </Text>
          <Button
            trackId="pantry.scan_kitchen"
            size="lg"
            fullWidth
            icon="camera-outline"
            onPress={() => router.push('/pantry/scan')}
          >
            {t('pantry.scanKitchen')}
          </Button>
        </Tile>
      ) : (
        <Tile padding={20} style={{ gap: 14 }}>
          <View style={{ gap: 4 }}>
            <Text variant="h2">{t('pantry.count', { count: items.length })}</Text>
            <Text variant="caption" tone="muted">
              {sinceScan == null ? t('pantry.notScanned') : t('pantry.scannedWhen', { when: pantryWhen(sinceScan, t) })}
            </Text>
          </View>
          {stale ? (
            <View
              style={{ flexDirection: 'row', gap: 8, borderRadius: Radii.inner, padding: 12, backgroundColor: colors.warningSoft }}
            >
              <KitIcon icon="time-outline" size={18} color={colors.warning} />
              <Text variant="caption" color={colors.warning} style={{ flex: 1, minWidth: 0 }}>
                {t('pantry.stale')}
              </Text>
            </View>
          ) : null}
          <Button
            trackId="pantry.scan_kitchen"
            size="lg"
            fullWidth
            icon="camera-outline"
            onPress={() => router.push('/pantry/scan')}
          >
            {t('pantry.scanKitchen')}
          </Button>
        </Tile>
      )}

      {!empty
        ? PANTRY_PLACES.map((place) => {
            const inPlace = byPlace[place];
            const days = daysSince(scannedAt[place]);
            const placeName = t(`pantry.places.${place}`);
            return (
              <Tile key={place} padding={20} style={{ gap: 12 }} testID={`pantry-place-${place}`}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                      <Text variant="h3" style={{ flexShrink: 1 }}>
                        {placeName}
                      </Text>
                      {inPlace.length > 0 ? <TileBadge>{String(inPlace.length)}</TileBadge> : null}
                    </View>
                    {days != null ? (
                      <Text variant="caption" tone="muted">
                        {t('pantry.scannedWhen', { when: pantryWhen(days, t) })}
                      </Text>
                    ) : null}
                  </View>
                  <Button
                    trackId="pantry.scan_place"
                    variant="link"
                    icon="camera-outline"
                    accessibilityLabel={t('pantry.scanPlace', { place: placeName })}
                    onPress={() => router.push(`/pantry/scan?place=${place}`)}
                  >
                    {inPlace.length > 0 ? t('pantry.scanAgain') : t('pantry.scanPlace', { place: placeName })}
                  </Button>
                </View>
                {undo && undo.place === place ? (
                  <View
                    accessibilityLiveRegion="polite"
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      gap: 8,
                      paddingStart: 12,
                      paddingEnd: 4,
                      borderRadius: Radii.inner,
                      backgroundColor: colors.backgroundElement,
                    }}
                  >
                    <Text variant="caption" style={{ flex: 1, minWidth: 0 }} numberOfLines={2}>
                      {t('pantry.removed', { name: undo.name })}
                    </Text>
                    <Button trackId="pantry.undo_remove" variant="link" onPress={() => void undoRemove()}>
                      {t('pantry.undo')}
                    </Button>
                  </View>
                ) : null}
                {inPlace.length === 0 ? (
                  <Text variant="bodySmall" tone="muted">
                    {t('pantry.emptyPlace')}
                  </Text>
                ) : (
                  <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
                    {inPlace.map((item) => (
                      <PantryChip
                        key={item.id}
                        label={item.name}
                        removeLabel={t('pantry.remove', { name: item.name })}
                        onRemove={() => void removeItem(item)}
                        onLongPress={() => itemMenu(item)}
                      />
                    ))}
                  </View>
                )}
              </Tile>
            );
          })
        : null}

      <Tile padding={20} style={{ gap: 12 }}>
        <Text variant="h3">{t('pantry.addItem')}</Text>
        <FieldInput
          placeholder={t('pantry.addPlaceholder')}
          accessibilityLabel={t('pantry.addItem')}
          value={draft}
          onChangeText={setDraft}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={() => void addItem()}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }} accessibilityRole="radiogroup">
          {PANTRY_PLACES.map((place) => (
            <Chip
              key={place}
              size="sm"
              kind="radio"
              selected={draftPlace === place}
              trackId={`pantry.add.place.${place}`}
              onPress={() => setDraftPlace(place)}
            >
              {t(`pantry.places.${place}`)}
            </Chip>
          ))}
        </View>
        <Button
          trackId="pantry.add"
          variant="secondary"
          icon="add"
          busy={adding}
          disabled={!draft.trim()}
          onPress={() => void addItem()}
        >
          {t('pantry.addTo', { place: t(`pantry.places.${draftPlace}`) })}
        </Button>
      </Tile>

      <Tile padding={20} style={{ gap: 12 }} testID="pantry-always-have">
        <View style={{ gap: 4 }}>
          <Text variant="h3">{t('pantry.alwaysHave')}</Text>
          <Text variant="caption" tone="muted">
            {t('pantry.alwaysHaveHint')}
          </Text>
        </View>
        {kitchen.pantryStaples.length > 0 ? (
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {kitchen.pantryStaples.map((staple) => (
              <PantryChip
                key={staple}
                label={staple}
                removeLabel={t('pantry.remove', { name: staple })}
                onRemove={() => kitchen.dropStaple(staple)}
              />
            ))}
          </View>
        ) : null}
        <FieldInput
          placeholder={t('settings.kitchenPantryPlaceholder')}
          accessibilityLabel={t('pantry.alwaysHave')}
          value={stapleDraft}
          onChangeText={setStapleDraft}
          maxLength={60}
          returnKeyType="done"
          onSubmitEditing={addStaple}
          trailing={
            <IconButton
              trackId="pantry.staple.add"
              icon="add"
              label={t('settings.kitchenPantryAdd')}
              disabled={!stapleDraft.trim()}
              onPress={addStaple}
            />
          }
        />
        {kitchen.error ? (
          <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
            {kitchen.error}
          </Text>
        ) : null}
      </Tile>
    </SettingsDetailScreen>
  );
}

/** One thing at home: its name in a pill, with × to take it out. Long-press for more (move, on a phone). */
function PantryChip({
  label,
  removeLabel,
  onRemove,
  onLongPress,
}: {
  label: string;
  removeLabel: string;
  onRemove: () => void;
  onLongPress?: () => void;
}) {
  const { colors } = useThemePreference();
  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        maxWidth: '100%',
        minHeight: 40,
        paddingStart: 14,
        borderRadius: 999,
        backgroundColor: colors.backgroundElement,
      }}
    >
      <Pressable
        trackId="pantry.item.menu"
        onLongPress={onLongPress}
        disabled={!onLongPress}
        accessibilityRole={onLongPress ? 'button' : 'text'}
        accessibilityLabel={label}
        style={{ flexShrink: 1, paddingVertical: 8 }}
      >
        <Text variant="bodySmall" numberOfLines={1}>
          {label}
        </Text>
      </Pressable>
      <IconButton trackId="pantry.item.remove" icon="close" iconSize={16} label={removeLabel} onPress={onRemove} />
    </View>
  );
}
