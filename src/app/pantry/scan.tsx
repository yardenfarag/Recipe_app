import { useNavigation } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router, Stack, useLocalSearchParams, type Href } from 'expo-router';
import { type ReactNode, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Platform, ScrollView, View } from 'react-native';

import { CheckRow, PantryBadgeIcon, PantrySignInPrompt } from '@/components/pantry/PantryParts';
import { Screen } from '@/components/Screen';
import { FieldInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon, Radii, type IconName } from '@/components/ui/tokens';
import { FormContentWidth } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { setPantryCache } from '@/hooks/usePantry';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { askConfirm } from '@/lib/dialog';
import { newScanId, readCurrentScanId, writeCurrentScanId } from '@/lib/pantryHelpers';
import { compressPantryPhoto, pickPantryPhotoUris } from '@/lib/pickCompressedImage';
import { groupByPlaceAndAisle, mergeScanPhotos, notSeenInScan } from '@shared/lib/pantry';
import { shoppingAisleForName } from '@shared/lib/shoppingAisles';
import {
  clearScan,
  deleteScanPhotos,
  fetchPantryItems,
  fetchScanPhotos,
  saveScan,
  scanPantryPhoto,
  type NewPantryItem,
} from '@shared/lib/supabase/pantry';
import { showToast } from '@shared/lib/toast';
import {
  PANTRY_PLACES,
  type PantryItem,
  type PantryPlace,
  type ReviewItem,
  type ScanPhoto,
} from '@shared/types/pantry';

/** Photos read at once. Each is up to ~1.4 MB on the wire; more than this only queues on a phone connection. */
const MAX_PARALLEL = 3;

type Shot = {
  key: string;
  place: PantryPlace;
  /** The picture on this device; null for a photo read in an earlier visit (only its results are on the server). */
  uri: string | null;
  state: 'reading' | 'done' | 'failed';
  photo?: ScanPhoto;
  code?: string;
};

type Row = ReviewItem & { ticked: boolean; renamed?: boolean };

type Phase = 'starting' | 'resume' | 'capture' | 'review';

const TIPS: { key: 'tipDoor' | 'tipLight' | 'tipShelf' | 'tipHidden'; icon: IconName }[] = [
  { key: 'tipDoor', icon: 'expand-outline' },
  { key: 'tipLight', icon: 'bulb-outline' },
  { key: 'tipShelf', icon: 'layers-outline' },
  { key: 'tipHidden', icon: 'eye-outline' },
];

const isPlace = (value: unknown): value is PantryPlace =>
  typeof value === 'string' && (PANTRY_PLACES as readonly string[]).includes(value);

/** Only paths inside the app: `?next=/first-recipes`. */
function safeNext(value: unknown): Href | null {
  return typeof value === 'string' && value.startsWith('/') && !value.startsWith('//') ? (value as Href) : null;
}

let localKey = 0;
const nextKey = () => `shot-${Date.now()}-${(localKey += 1)}`;

/**
 * Scan your kitchen (PIN-181). Capture: pick a place, take photos or choose several; each is sent to scan-pantry the
 * moment it's picked, so the list fills while the next one is taken. Review: tick what's right, fix names, add what
 * was missed, and say which saved items are gone, then save. The scan id stays on the device until it's saved, so
 * leaving half-way can be picked up again (the server keeps the results for a week).
 *
 * `?place=` opens on that place; `?next=` is where to go after saving (default: back to the Pantry page).
 */
export default function PantryScanScreen() {
  const { t, i18n } = useTranslation();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const navigation = useNavigation();
  const params = useLocalSearchParams<{ place?: string; next?: string }>();
  const next = safeNext(params.next);
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const { language } = useLanguagePreference();

  const [phase, setPhase] = useState<Phase>('starting');
  const [scanId, setScanId] = useState<string | null>(null);
  const [resumeCount, setResumeCount] = useState(0);
  const resumePhotos = useRef<ScanPhoto[]>([]);
  const [activePlace, setActivePlace] = useState<PantryPlace>(isPlace(params.place) ? params.place : 'fridge');
  const [shots, setShots] = useState<Shot[]>([]);
  const [dailyLimited, setDailyLimited] = useState(false);
  const [rows, setRows] = useState<Row[]>([]);
  const [saved, setSaved] = useState<PantryItem[] | null>(null);
  const [removeIds, setRemoveIds] = useState<Set<string>>(() => new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const shotsRef = useRef(shots);
  shotsRef.current = shots;
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const scanIdRef = useRef(scanId);
  scanIdRef.current = scanId;
  const base64s = useRef(new Map<string, string>());
  const queue = useRef<string[]>([]);
  const running = useRef(0);
  const allowLeave = useRef(false);
  const mounted = useRef(true);
  useEffect(
    () => () => {
      mounted.current = false;
    },
    [],
  );

  // ── Starting: a new scan, or the one left half-way ──────────────────────────
  useEffect(() => {
    if (!userId) return;
    let active = true;
    void (async () => {
      const stored = await readCurrentScanId(userId);
      if (stored) {
        try {
          const photos = await fetchScanPhotos(stored);
          if (!active) return;
          if (photos.length > 0) {
            resumePhotos.current = photos;
            setResumeCount(photos.length);
            setScanId(stored);
            setPhase('resume');
            return;
          }
          setScanId(stored);
          setPhase('capture');
          return;
        } catch {
          // Can't tell: start a new scan rather than block.
        }
      }
      if (!active) return;
      const id = newScanId();
      await writeCurrentScanId(userId, id);
      if (!active) return;
      setScanId(id);
      setPhase('capture');
    })();
    return () => {
      active = false;
    };
  }, [userId]);

  function keepGoing() {
    setShots(
      resumePhotos.current.map((photo) => ({
        key: photo.id ?? nextKey(),
        place: photo.place,
        uri: null,
        state: 'done' as const,
        photo,
      })),
    );
    setPhase('capture');
  }

  async function startOver() {
    if (!userId) return;
    const old = scanIdRef.current;
    if (old) void clearScan(old).catch(() => {});
    const id = newScanId();
    await writeCurrentScanId(userId, id);
    resumePhotos.current = [];
    setShots([]);
    setScanId(id);
    setPhase('capture');
  }

  // ── Sending photos ──────────────────────────────────────────────────────────
  const update = useCallback((key: string, patch: Partial<Shot>) => {
    setShots((current) => current.map((shot) => (shot.key === key ? { ...shot, ...patch } : shot)));
  }, []);

  const send = useCallback(
    async (key: string) => {
      const shot = shotsRef.current.find((s) => s.key === key);
      const imageBase64 = base64s.current.get(key);
      const id = scanIdRef.current;
      if (!shot || !imageBase64 || !id) return;
      const result = await scanPantryPhoto({ scanId: id, place: shot.place, language, imageBase64 });
      if (!mounted.current) return;
      if (!shotsRef.current.some((s) => s.key === key)) {
        // Removed while it was being read.
        if (result.status === 'ok' && result.photo.id) void deleteScanPhotos([result.photo.id]).catch(() => {});
        return;
      }
      if (result.status === 'ok') {
        base64s.current.delete(key);
        update(key, { state: 'done', photo: result.photo, code: undefined });
        return;
      }
      update(key, { state: 'failed', code: result.code });
      if (result.code === 'daily_limit') {
        setDailyLimited(true);
        announce(t('pantry.scan.dailyLimit'));
      }
    },
    [language, t, update],
  );

  const pump = useCallback(() => {
    while (running.current < MAX_PARALLEL && queue.current.length > 0) {
      const key = queue.current.shift()!;
      running.current += 1;
      void send(key).finally(() => {
        running.current -= 1;
        pump();
      });
    }
  }, [send]);

  async function addPhotos(place: PantryPlace, source: 'camera' | 'library') {
    const uris = await pickPantryPhotoUris(source, {
      permissionTitle: t('settings.permissionNeededTitle'),
      permissionCamera: t('settings.permissionCamera'),
      permissionLibrary: t('settings.permissionLibrary'),
    });
    if (!uris || !mounted.current) return;
    const added = uris.map((uri) => ({ key: nextKey(), place, uri, state: 'reading' as const }));
    setShots((current) => [...current, ...added]);
    shotsRef.current = [...shotsRef.current, ...added];
    // One at a time, so a dozen full-size photos never sit in memory together; each is sent once it's ready.
    for (const shot of added) {
      const compressed = await compressPantryPhoto(shot.uri);
      if (!mounted.current) return;
      if (!compressed) {
        update(shot.key, { state: 'failed', code: 'invalid_photo' });
        showToast(t('pantry.scan.photoUnreadable'), 'error');
        continue;
      }
      base64s.current.set(shot.key, compressed.base64);
      update(shot.key, { uri: compressed.uri });
      queue.current.push(shot.key);
      pump();
    }
  }

  function removeShot(shot: Shot) {
    base64s.current.delete(shot.key);
    queue.current = queue.current.filter((key) => key !== shot.key);
    setShots((current) => current.filter((s) => s.key !== shot.key));
    shotsRef.current = shotsRef.current.filter((s) => s.key !== shot.key);
    if (shot.photo?.id) void deleteScanPhotos([shot.photo.id]).catch(() => {});
  }

  function retake(shot: Shot) {
    removeShot(shot);
    void addPhotos(shot.place, Platform.OS === 'web' ? 'library' : 'camera');
  }

  function tryAgain(shot: Shot) {
    if (!base64s.current.has(shot.key)) {
      retake(shot);
      return;
    }
    update(shot.key, { state: 'reading', code: undefined });
    queue.current.push(shot.key);
    pump();
  }

  // ── What the photos found ───────────────────────────────────────────────────
  const donePhotos = useMemo(
    () => shots.flatMap((shot) => (shot.state === 'done' && shot.photo ? [shot.photo] : [])),
    [shots],
  );
  const merged = useMemo(() => mergeScanPhotos(donePhotos), [donePhotos]);
  const reading = shots.some((shot) => shot.state === 'reading');
  const scannedPlaces = useMemo(
    () => PANTRY_PLACES.filter((place) => donePhotos.some((p) => p.place === place && p.quality !== 'not_kitchen')),
    [donePhotos],
  );

  async function goToReview() {
    setRows((current) => {
      const byKey = new Map(current.map((row) => [row.key, row]));
      const fromPhotos = merged.map((item) => byKey.get(item.key) ?? { ...item, ticked: item.sure });
      return [...fromPhotos, ...current.filter((row) => row.manual)];
    });
    setPhase('review');
    if (saved == null) {
      try {
        setSaved(await fetchPantryItems());
      } catch {
        // Without the saved list there's just no "Not in these photos".
        setSaved([]);
      }
    }
  }

  const notSeen = useMemo(
    () => (saved ? notSeenInScan(saved, rows, scannedPlaces) : []),
    [saved, rows, scannedPlaces],
  );
  const tickedCount = rows.filter((row) => row.ticked).length;

  function toggleRow(key: string) {
    setRows((current) => current.map((row) => (row.key === key ? { ...row, ticked: !row.ticked } : row)));
  }

  function renameRow(key: string, name: string) {
    const trimmed = name.trim();
    setEditingKey(null);
    if (!trimmed) return;
    setRows((current) =>
      current.map((row) =>
        row.key === key && row.name !== trimmed
          ? // Naming a mystery tub means the person knows what it is: tick it.
            { ...row, name: trimmed, renamed: true, ticked: row.containerUnknown ? true : row.ticked }
          : row,
      ),
    );
  }

  function addMissed(place: PantryPlace, name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setRows((current) => [
      ...current,
      {
        key: `manual:${place}:${nextKey()}`,
        name: trimmed,
        nameEn: '',
        brand: '',
        place,
        aisle: shoppingAisleForName(trimmed),
        sure: true,
        containerUnknown: false,
        manual: true,
        ticked: true,
      },
    ]);
  }

  function toggleRemove(id: string) {
    setRemoveIds((current) => {
      const nextSet = new Set(current);
      if (nextSet.has(id)) nextSet.delete(id);
      else nextSet.add(id);
      return nextSet;
    });
  }

  function leaveTo(target: Href | null) {
    allowLeave.current = true;
    if (target) router.replace(target);
    else if (router.canGoBack()) router.back();
    else router.replace('/settings/pantry');
  }

  async function save() {
    if (!userId || !scanId || saving) return;
    setSaving(true);
    const keep: NewPantryItem[] = rows
      .filter((row) => row.ticked)
      .map((row) => ({
        name: row.name,
        // A new name drops the English one, which named what the photo seemed to show.
        nameEn: row.renamed ? '' : row.nameEn,
        brand: row.brand,
        place: row.place,
        aisle: row.aisle,
        source: row.manual ? 'manual' : 'scan',
      }));
    try {
      await saveScan(userId, scanId, keep, [...removeIds]);
    } catch {
      setSaving(false);
      showToast(t('pantry.saveFailed'), 'error');
      return;
    }
    await writeCurrentScanId(userId, null);
    void fetchPantryItems()
      .then((items) => setPantryCache(userId, items))
      .catch(() => {});
    showToast(t('pantry.review.saved'));
    leaveTo(next);
  }

  // ── Leaving ─────────────────────────────────────────────────────────────────
  useEffect(
    () =>
      navigation.addListener('beforeRemove', (event) => {
        if (allowLeave.current) return;
        if (phaseRef.current === 'review') {
          event.preventDefault();
          setPhase('capture');
          return;
        }
        const hasPhotos = shotsRef.current.length > 0;
        if (!hasPhotos && !next) return;
        event.preventDefault();
        void (async () => {
          if (hasPhotos) {
            const ok = await askConfirm({
              trackId: 'pantry_scan.leave_dialog',
              title: t('pantry.scan.leaveTitle'),
              message: t('pantry.scan.leaveBody'),
              confirmLabel: t('pantry.scan.leave'),
            });
            if (!ok) return;
          }
          allowLeave.current = true;
          // From sign-up the screen below is onboarding: go on to where the flow continues instead.
          if (next) router.replace(next);
          else navigation.dispatch(event.data.action);
        })();
      }),
    [navigation, next, t],
  );

  const title = phase === 'review' ? t('pantry.review.title') : t('pantry.scan.title');
  const screenOptions = (
    <Stack.Screen options={{ title, gestureEnabled: !next && phase !== 'review' }} />
  );
  const widthStyle = isMediumUp ? { maxWidth: FormContentWidth, width: '100%' as const, alignSelf: 'center' as const } : null;

  if (!authLoading && !user) {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        {screenOptions}
        <View style={[{ padding: 20 }, widthStyle]}>
          <PantrySignInPrompt />
        </View>
      </Screen>
    );
  }

  if (phase === 'starting' || authLoading) {
    return (
      <Screen edges={['left', 'right', 'bottom']} style={{ alignItems: 'center', justifyContent: 'center' }}>
        {screenOptions}
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} />
      </Screen>
    );
  }

  if (phase === 'resume') {
    return (
      <Screen edges={['left', 'right', 'bottom']}>
        {screenOptions}
        <View style={[{ flex: 1, justifyContent: 'center', padding: 20 }, widthStyle]}>
          <Tile padding={24} style={{ alignItems: 'center', gap: 14 }}>
            <PantryBadgeIcon icon="images-outline" />
            <Text variant="h3" align="center">
              {t('pantry.scan.resumeTitle')}
            </Text>
            <Text variant="bodySmall" tone="muted" align="center">
              {t('pantry.scan.resumeBody', { count: resumeCount })}
            </Text>
            <Button trackId="pantry_scan.resume" fullWidth size="lg" onPress={keepGoing}>
              {t('pantry.scan.resume')}
            </Button>
            <Button trackId="pantry_scan.start_over" fullWidth variant="outline" onPress={() => void startOver()}>
              {t('pantry.scan.startOver')}
            </Button>
          </Tile>
        </View>
      </Screen>
    );
  }

  if (phase === 'review') {
    const notSure = rows.filter((row) => !row.sure && !row.manual);
    const sureRows = rows.filter((row) => row.sure || row.manual);
    const groups = groupByPlaceAndAisle(sureRows, i18n.language);
    const reviewPlaces = PANTRY_PLACES.filter(
      (place) => scannedPlaces.includes(place) || groups.some((group) => group.place === place),
    );
    const renderRow = (row: Row, index: number) => (
      <ReviewRow
        key={row.key}
        row={row}
        first={index === 0}
        editing={editingKey === row.key}
        onToggle={() => toggleRow(row.key)}
        onEdit={() => setEditingKey(row.key)}
        onRename={(name) => renameRow(row.key, name)}
      />
    );

    return (
      <Screen edges={['left', 'right', 'bottom']}>
        {screenOptions}
        <ScrollView
          style={{ flex: 1 }}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={[{ padding: 20, paddingBottom: 32, gap: 16 }, widthStyle]}
        >
          <View
            accessibilityRole="summary"
            style={{
              flexDirection: 'row',
              gap: 10,
              padding: 14,
              borderRadius: Radii.inner,
              backgroundColor: colors.warningSoft,
            }}
          >
            <KitIcon icon="alert-circle-outline" size={20} color={colors.warning} />
            <Text variant="bodySmall" weight="semibold" color={colors.warning} style={{ flex: 1, minWidth: 0 }}>
              {t('pantry.review.disclaimer')}
            </Text>
          </View>

          <Button trackId="pantry_review.back" variant="link" icon="arrow-back" onPress={() => setPhase('capture')}>
            {t('pantry.review.back')}
          </Button>

          {notSure.length > 0 ? (
            <Tile padding={20} style={{ gap: 8 }}>
              <View style={{ gap: 4, marginBottom: 4 }}>
                <Text variant="h3">{t('pantry.review.notSure')}</Text>
                <Text variant="caption" tone="muted">
                  {t('pantry.review.notSureHint')}
                </Text>
              </View>
              <View>{notSure.map(renderRow)}</View>
            </Tile>
          ) : null}

          {reviewPlaces.map((place) => {
            const group = groups.find((g) => g.place === place);
            return (
              <Tile key={place} padding={20} style={{ gap: 8 }} testID={`pantry-review-${place}`}>
                <Text variant="h3">{t(`pantry.places.${place}`)}</Text>
                {group?.aisles.map((aisle) => (
                  <View key={aisle.aisle} style={{ marginTop: 6 }}>
                    <TileLabel accessibilityRole="header" style={{ marginBottom: 2 }}>
                      {t(`pantry.aisles.${aisle.aisle}`)}
                    </TileLabel>
                    {aisle.items.map((item, index) => renderRow(item as Row, index))}
                  </View>
                ))}
                <AddMissedField onAdd={(name) => addMissed(place, name)} />
              </Tile>
            );
          })}

          {notSeen.length > 0 ? (
            <Tile padding={20} style={{ gap: 8 }}>
              <View style={{ gap: 4, marginBottom: 4 }}>
                <Text variant="h3">{t('pantry.review.notSeenTitle')}</Text>
                <Text variant="caption" tone="muted">
                  {t('pantry.review.notSeenHint')}
                </Text>
              </View>
              <View>
                {notSeen.map((item, index) => (
                  <CheckRow
                    key={item.id}
                    trackId="pantry_review.not_seen.toggle"
                    first={index === 0}
                    checked={removeIds.has(item.id)}
                    onToggle={() => toggleRemove(item.id)}
                    label={item.name}
                    detail={[t(`pantry.places.${item.place}`), item.brand].filter(Boolean).join(' · ')}
                  />
                ))}
              </View>
            </Tile>
          ) : null}
        </ScrollView>
        <Footer>
          <Button trackId="pantry_review.save" size="lg" fullWidth busy={saving} onPress={() => void save()}>
            {tickedCount > 0 ? t('pantry.review.save', { count: tickedCount }) : t('pantry.review.saveNone')}
          </Button>
        </Footer>
      </Screen>
    );
  }

  // ── Capture ─────────────────────────────────────────────────────────────────
  const canReview = !reading && donePhotos.length > 0;
  const reviewLabel = reading
    ? t('pantry.scan.waiting')
    : shots.length === 0
      ? t('pantry.scan.reviewEmpty')
      : t('pantry.scan.review', { count: merged.length });

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      {screenOptions}
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={[{ padding: 20, paddingBottom: 32, gap: 16 }, widthStyle]}
      >
        <Text variant="bodySmall" tone="muted">
          {t('pantry.scan.intro')}
        </Text>

        <View
          style={{
            flexDirection: 'row',
            flexWrap: 'wrap',
            rowGap: 10,
            columnGap: 16,
            padding: 14,
            borderRadius: Radii.inner,
            backgroundColor: colors.backgroundElement,
          }}
        >
          {TIPS.map((tip) => (
            <View key={tip.key} style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexBasis: '45%', flexGrow: 1 }}>
              <KitIcon icon={tip.icon} size={18} color={colors.primaryText} />
              <Text variant="caption" style={{ flex: 1, minWidth: 0 }}>
                {t(`pantry.scan.${tip.key}`)}
              </Text>
            </View>
          ))}
        </View>

        {dailyLimited ? (
          <View
            accessibilityLiveRegion="polite"
            style={{ flexDirection: 'row', gap: 10, padding: 14, borderRadius: Radii.inner, backgroundColor: colors.dangerSoft }}
          >
            <KitIcon icon="alert-circle-outline" size={18} color={colors.danger} />
            <Text variant="caption" tone="danger" style={{ flex: 1, minWidth: 0 }}>
              {t('pantry.scan.dailyLimit')}
            </Text>
          </View>
        ) : null}

        {PANTRY_PLACES.map((place) => {
          const placeShots = shots.filter((shot) => shot.place === place);
          const itemCount = merged.filter((item) => item.place === place).length;
          const active = activePlace === place;
          const placePhotos = placeShots.flatMap((shot) => (shot.photo ? [shot.photo] : []));
          const hints = [
            placePhotos.some((p) => p.quality === 'too_dark' || p.quality === 'blurry' || p.quality === 'too_far')
              ? t('pantry.scan.qualityHint')
              : null,
            placePhotos.some((p) => p.quality === 'not_kitchen') ? t('pantry.scan.notKitchenHint') : null,
            placePhotos.some((p) => p.truncated) ? t('pantry.scan.truncatedHint') : null,
          ].filter((hint): hint is string => Boolean(hint));
          return (
            <Tile
              key={place}
              testID={`pantry-scan-${place}`}
              style={[{ overflow: 'hidden' }, active ? { borderColor: colors.primary, borderWidth: 2 } : null]}
            >
              <Pressable
                trackId={`pantry_scan.place.${place}`}
                onPress={() => setActivePlace(place)}
                accessibilityRole="button"
                accessibilityState={{ expanded: active }}
                style={({ pressed }) => ({
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 12,
                  padding: 18,
                  backgroundColor: pressed ? colors.backgroundElement : 'transparent',
                })}
              >
                <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
                  <Text variant="h3">{t(`pantry.places.${place}`)}</Text>
                  <Text variant="caption" tone="muted">
                    {t(`pantry.placeHints.${place}`)}
                  </Text>
                </View>
                {placeShots.length > 0 ? (
                  <View style={{ alignItems: 'flex-end', gap: 4 }}>
                    <TileBadge>{t('pantry.scan.items', { count: itemCount })}</TileBadge>
                    <Text variant="caption" tone="muted">
                      {t('pantry.scan.photos', { count: placeShots.length })}
                    </Text>
                  </View>
                ) : null}
              </Pressable>

              {placeShots.length > 0 ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: 10, paddingHorizontal: 18, paddingBottom: 14 }}
                >
                  {placeShots.map((shot) => (
                    <ShotCard
                      key={shot.key}
                      shot={shot}
                      onRemove={() => removeShot(shot)}
                      onRetake={() => retake(shot)}
                      onTryAgain={() => tryAgain(shot)}
                    />
                  ))}
                </ScrollView>
              ) : null}

              {hints.length > 0 ? (
                <View style={{ gap: 4, paddingHorizontal: 18, paddingBottom: 14 }}>
                  {hints.map((hint) => (
                    <Text key={hint} variant="caption" tone="muted">
                      {hint}
                    </Text>
                  ))}
                </View>
              ) : null}

              {active ? (
                <View
                  style={{
                    flexDirection: 'row',
                    flexWrap: 'wrap',
                    gap: 10,
                    padding: 18,
                    paddingTop: 14,
                    borderTopWidth: HAIRLINE,
                    borderColor: colors.border,
                  }}
                >
                  {Platform.OS !== 'web' ? (
                    <Button
                      trackId="pantry_scan.take_photo"
                      icon="camera-outline"
                      style={{ flexGrow: 1 }}
                      onPress={() => void addPhotos(place, 'camera')}
                    >
                      {t('pantry.scan.takePhoto')}
                    </Button>
                  ) : null}
                  <Button
                    trackId="pantry_scan.choose_photos"
                    variant={Platform.OS === 'web' ? 'primary' : 'secondary'}
                    icon="images-outline"
                    style={{ flexGrow: 1 }}
                    onPress={() => void addPhotos(place, 'library')}
                  >
                    {Platform.OS === 'web' ? t('pantry.scan.upload') : t('pantry.scan.choosePhotos')}
                  </Button>
                </View>
              ) : null}
            </Tile>
          );
        })}
      </ScrollView>
      <Footer>
        <Button
          trackId="pantry_scan.review"
          size="lg"
          fullWidth
          disabled={!canReview}
          busy={reading && donePhotos.length === 0}
          onPress={() => void goToReview()}
        >
          {reviewLabel}
        </Button>
      </Footer>
    </Screen>
  );
}

function Footer({ children }: { children: ReactNode }) {
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  return (
    <View
      style={{
        paddingHorizontal: 20,
        paddingTop: 12,
        paddingBottom: 12,
        borderTopWidth: HAIRLINE,
        borderTopColor: colors.border,
        backgroundColor: colors.background,
      }}
    >
      <View style={isMediumUp ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' } : null}>
        {children}
      </View>
    </View>
  );
}

/** One photo: the picture, what it found (or what went wrong), and what to do about it. */
function ShotCard({
  shot,
  onRemove,
  onRetake,
  onTryAgain,
}: {
  shot: Shot;
  onRemove: () => void;
  onRetake: () => void;
  onTryAgain: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const quality = shot.photo?.quality;
  const problem = quality === 'too_dark' || quality === 'blurry' || quality === 'too_far';

  let status: string;
  let tone: 'muted' | 'danger' | 'default' = 'muted';
  if (shot.state === 'reading') status = t('pantry.scan.reading');
  else if (shot.state === 'failed') {
    // The daily limit is spelled out once, above the places.
    status = t('pantry.scan.failed');
    tone = 'danger';
  } else if (quality === 'not_kitchen') status = t('pantry.scan.notKitchen');
  else if (quality === 'too_dark') status = t('pantry.scan.tooDark');
  else if (quality === 'blurry') status = t('pantry.scan.blurry');
  else if (quality === 'too_far') status = t('pantry.scan.tooFar');
  else {
    const count = shot.photo?.items.length ?? 0;
    status = count === 0 ? t('pantry.scan.nothingFound') : t('pantry.scan.items', { count });
    tone = 'default';
  }
  if (problem) tone = 'danger';

  return (
    <View style={{ width: 116, gap: 6 }}>
      <View
        style={{
          width: 116,
          height: 116,
          borderRadius: Radii.inner,
          overflow: 'hidden',
          backgroundColor: colors.backgroundElement,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        {shot.uri ? (
          <Image source={{ uri: shot.uri }} style={{ width: '100%', height: '100%' }} contentFit="cover" />
        ) : (
          <KitIcon icon="image-outline" size={28} color={colors.textSecondary} />
        )}
        {shot.state === 'reading' ? (
          <View
            style={{
              position: 'absolute',
              top: 0,
              bottom: 0,
              start: 0,
              end: 0,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.overlay,
            }}
          >
            <ActivityIndicator color={colors.surface} />
          </View>
        ) : null}
        <IconButton
          trackId="pantry_scan.remove_photo"
          variant="photo"
          icon="close"
          iconSize={16}
          label={t('pantry.scan.removePhoto')}
          onPress={onRemove}
          style={{ position: 'absolute', top: 0, end: 0 }}
        />
      </View>
      <Text
        variant="caption"
        weight="semibold"
        tone={tone}
        numberOfLines={2}
        accessibilityLiveRegion="polite"
      >
        {status}
      </Text>
      {problem ? (
        <Button trackId="pantry_scan.retake" variant="link" icon="camera-outline" onPress={onRetake}>
          {t('pantry.scan.retake')}
        </Button>
      ) : shot.state === 'failed' && shot.code !== 'daily_limit' ? (
        <Button trackId="pantry_scan.try_again" variant="link" icon="refresh" onPress={onTryAgain}>
          {t('pantry.scan.tryAgain')}
        </Button>
      ) : null}
    </View>
  );
}

/** A review row: tick it, tap the name to fix it; the brand and any hint muted under it. */
function ReviewRow({
  row,
  first,
  editing,
  onToggle,
  onEdit,
  onRename,
}: {
  row: Row;
  first: boolean;
  editing: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRename: (name: string) => void;
}) {
  const { t } = useTranslation();
  const [draft, setDraft] = useState(row.name);
  useEffect(() => {
    if (editing) setDraft(row.name);
  }, [editing, row.name]);

  const detail = [row.brand, row.containerUnknown && !row.renamed ? t('pantry.review.containerHint') : null]
    .filter(Boolean)
    .join(' · ');

  return (
    <CheckRow
      trackId="pantry_review.toggle"
      first={first}
      checked={row.ticked}
      onToggle={onToggle}
      label={row.name}
      detail={editing ? null : detail}
    >
      {editing ? (
        <FieldInput
          size="sm"
          autoFocus
          value={draft}
          onChangeText={setDraft}
          maxLength={60}
          returnKeyType="done"
          accessibilityLabel={t('pantry.review.rename', { name: row.name })}
          onSubmitEditing={() => onRename(draft)}
          onBlur={() => onRename(draft)}
        />
      ) : (
        <Pressable
          trackId="pantry_review.rename"
          onPress={onEdit}
          accessibilityRole="button"
          accessibilityLabel={t('pantry.review.rename', { name: row.name })}
          style={{ alignSelf: 'flex-start', paddingVertical: 2 }}
        >
          <Text variant="bodySmall" weight="semibold" numberOfLines={2}>
            {row.name}
          </Text>
        </Pressable>
      )}
    </CheckRow>
  );
}

/** "Add something we missed": a field at the end of a place's tile. */
function AddMissedField({ onAdd }: { onAdd: (name: string) => void }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [draft, setDraft] = useState('');
  function add() {
    if (!draft.trim()) return;
    onAdd(draft);
    setDraft('');
  }
  return (
    <FieldInput
      size="sm"
      containerStyle={{ marginTop: 8 }}
      placeholder={t('pantry.review.addMissed')}
      accessibilityLabel={t('pantry.review.addMissed')}
      value={draft}
      onChangeText={setDraft}
      maxLength={60}
      returnKeyType="done"
      onSubmitEditing={add}
      leading={<KitIcon icon="add" size={18} color={colors.textSecondary} />}
      trailing={
        draft.trim() ? (
          <IconButton trackId="pantry_review.add_missed" icon="checkmark" label={t('pantry.addItem')} onPress={add} />
        ) : null
      }
    />
  );
}
