import Ionicons from '@expo/vector-icons/Ionicons';
import * as DocumentPicker from 'expo-document-picker';
import { Image } from 'expo-image';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { router, useLocalSearchParams } from 'expo-router';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, FlatList, Platform, ScrollView, Text, View } from 'react-native';

import { Pressable } from '@/components/ui/Pressable';
import { Screen } from '@/components/Screen';
import { TokenPurchaseSheet } from '@/components/TokenPurchaseSheet';
import { FormContentWidth } from '@/constants/theme';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useProfile } from '@/hooks/useProfile';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { openAppStore } from '@/lib/appStore';
import { creditPurchasesOfferedOn } from '@/lib/purchases';
import {
  cachedChatPhotoUri,
  chatFileSize,
  clearChatPhotoCache,
  fetchSavedSourceUrls,
  loadImportedIds,
  readChatFileBytes,
  rememberImportedIds,
} from '@/lib/whatsappImport/chatFile';
import { createWhatsAppImportOne } from '@/lib/whatsappImport/importOne';
import {
  findRecipeCandidates,
  MAX_CHAT_FILE_BYTES,
  readChatExport,
  runImportBatch,
  WhatsAppImportError,
  type BatchProgress,
  type CandidateKind,
  type ChatExport,
  type ImportItemState,
  type LinkPlatform,
  type RecipeCandidate,
} from '@shared/lib/whatsappImport';

/**
 * Import recipes from a WhatsApp chat (ADR 032). The chat is read on the phone; only the ticked items go to
 * extract-recipe, one credit each, two at a time. Opened from the Add tab, or with `file` when a WhatsApp export is
 * shared into Pinch (src/hooks/useShareIntentRouter.tsx).
 */

type Phase = 'intro' | 'reading' | 'review' | 'importing' | 'done';
type KindFilter = 'all' | CandidateKind;

const KEEP_AWAKE_TAG = 'whatsapp-import';
const CONCURRENCY = 2;

const PLATFORM_ICONS: Record<LinkPlatform, keyof typeof Ionicons.glyphMap> = {
  youtube: 'logo-youtube',
  instagram: 'logo-instagram',
  tiktok: 'logo-tiktok',
  facebook: 'logo-facebook',
  pinterest: 'logo-pinterest',
  web: 'globe-outline',
};

function errorKey(error: unknown): string {
  if (error instanceof WhatsAppImportError) {
    if (error.code === 'not_a_chat') return 'whatsappImport.errorNotAChat';
    if (error.code === 'too_big') return 'whatsappImport.errorTooBig';
    return 'whatsappImport.errorEmpty';
  }
  return 'whatsappImport.errorRead';
}

/** Android file pickers type a WhatsApp .zip in several ways, so Android shows every file; the reader checks it. */
const PICKER_TYPES = Platform.OS === 'android' ? '*/*' : ['application/zip', 'text/plain'];

function emptyProgress(items: readonly RecipeCandidate[]): BatchProgress {
  return {
    total: items.length,
    done: 0,
    saved: 0,
    alreadySaved: 0,
    failed: 0,
    stoppedForCredits: false,
    cancelled: false,
    items: Object.fromEntries(items.map((item) => [item.id, 'waiting' as ImportItemState])),
    recipeIds: {},
  };
}

export default function WhatsAppImportScreen() {
  const { t } = useTranslation();
  const { language } = useLanguagePreference();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const { textAlign, writingDirection } = useRtl();
  const rtlText = { textAlign, writingDirection };
  const { user, loading: authLoading } = useAuth();
  const { totalCredits, refresh: refreshProfile } = useProfile();
  const purchasesHere = creditPurchasesOfferedOn(Platform.OS);
  const params = useLocalSearchParams<{ file?: string; name?: string; size?: string }>();

  const [phase, setPhase] = useState<Phase>('intro');
  const [error, setError] = useState<string | null>(null);
  const [candidates, setCandidates] = useState<RecipeCandidate[]>([]);
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [filter, setFilter] = useState<KindFilter>('all');
  const [batch, setBatch] = useState<RecipeCandidate[]>([]);
  const [progress, setProgress] = useState<BatchProgress | null>(null);
  const [creditsOpen, setCreditsOpen] = useState(false);
  /** The last batch stopped at the day's import limit, not for credits (both set stoppedForCredits). */
  const [dailyLimit, setDailyLimit] = useState(false);
  const chatRef = useRef<ChatExport | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const openedShareRef = useRef<string | null>(null);
  /** Photo file name → its unpacked cache URI, for the chat on screen. */
  const photoUris = useRef(new Map<string, string | null>());

  // Leaving the screen stops the import: what's done is saved, the rest isn't started.
  useEffect(
    () => () => {
      abortRef.current?.abort();
      deactivateKeepAwake(KEEP_AWAKE_TAG);
    },
    [],
  );

  useEffect(() => {
    if (error) announce(error);
  }, [error]);

  const openChat = useCallback(
    async (file: { uri: string; name: string; size: number | null }) => {
      setError(null);
      setPhase('reading');
      try {
        const size = file.size ?? chatFileSize(file.uri);
        if (size != null && size > MAX_CHAT_FILE_BYTES) throw new WhatsAppImportError('too_big');
        // Let the "Reading the chat…" state paint before the parse holds the JS thread.
        await new Promise((resolve) => setTimeout(resolve, 50));
        const bytes = await readChatFileBytes(file.uri);
        const chat = readChatExport({ name: file.name, bytes });
        const [savedSourceUrls, importedIds] = await Promise.all([
          fetchSavedSourceUrls().catch((err: unknown) => {
            console.warn('[whatsapp-import] Library links failed to load', err);
            return [] as string[];
          }),
          loadImportedIds(),
        ]);
        const found = findRecipeCandidates(chat, { savedSourceUrls, importedIds });
        if (found.length === 0) throw new WhatsAppImportError('empty');
        clearChatPhotoCache();
        photoUris.current.clear();
        chatRef.current = chat;
        setCandidates(found);
        setSelected(new Set(found.filter((c) => c.likelyRecipe && !c.alreadySaved).map((c) => c.id)));
        setFilter('all');
        setProgress(null);
        setBatch([]);
        setPhase('review');
        announce(t('whatsappImport.found', { count: found.length }));
      } catch (err) {
        if (!(err instanceof WhatsAppImportError)) console.warn('[whatsapp-import] read failed', err);
        setError(t(errorKey(err)));
        setPhase('intro');
      }
    },
    [t],
  );

  // A WhatsApp export shared into Pinch arrives as `file`. Opened once signed in.
  useEffect(() => {
    const uri = typeof params.file === 'string' ? params.file : '';
    if (!uri || !user || openedShareRef.current === uri) return;
    if (phase === 'importing') return;
    openedShareRef.current = uri;
    const size = Number(params.size);
    void openChat({
      uri,
      name: typeof params.name === 'string' && params.name ? params.name : '_chat.txt',
      size: Number.isFinite(size) && size > 0 ? size : null,
    });
  }, [params.file, params.name, params.size, user, phase, openChat]);

  async function chooseFile() {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: PICKER_TYPES,
        copyToCacheDirectory: true,
        multiple: false,
      });
      const asset = result.canceled ? null : result.assets[0];
      if (!asset) return;
      await openChat({ uri: asset.uri, name: asset.name, size: asset.size ?? null });
    } catch (err) {
      console.warn('[whatsapp-import] picker failed', err);
      setError(t('whatsappImport.errorRead'));
    }
  }

  async function runBatch(items: RecipeCandidate[]) {
    const chat = chatRef.current;
    if (!chat || !user || items.length === 0) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setBatch(items);
    setProgress(emptyProgress(items));
    setDailyLimit(false);
    setPhase('importing');
    void activateKeepAwakeAsync(KEEP_AWAKE_TAG).catch(() => undefined);
    try {
      const final = await runImportBatch(items, createWhatsAppImportOne({ chat, userId: user.id, onDailyLimit: () => setDailyLimit(true) }), {
        concurrency: CONCURRENCY,
        signal: controller.signal,
        onProgress: (next) => setProgress({ ...next, items: { ...next.items }, recipeIds: { ...next.recipeIds } }),
      });
      setProgress(final);
      const doneIds = items
        .filter((item) => final.items[item.id] === 'saved' || final.items[item.id] === 'already_saved')
        .map((item) => item.id);
      await rememberImportedIds(doneIds);
      const done = new Set(doneIds);
      setCandidates((prev) => prev.map((c) => (done.has(c.id) ? { ...c, alreadySaved: true } : c)));
      setSelected((prev) => new Set([...prev].filter((id) => !done.has(id))));
      announce(t('whatsappImport.doneSaved', { count: final.saved }));
    } finally {
      deactivateKeepAwake(KEEP_AWAKE_TAG);
      if (abortRef.current === controller) abortRef.current = null;
      void refreshProfile();
      setPhase('done');
    }
  }

  function startImport() {
    void runBatch(candidates.filter((c) => selected.has(c.id) && !c.alreadySaved));
  }

  function chooseAnother() {
    abortRef.current?.abort();
    chatRef.current = null;
    clearChatPhotoCache();
    photoUris.current.clear();
    setCandidates([]);
    setSelected(new Set());
    setProgress(null);
    setBatch([]);
    setError(null);
    setPhase('intro');
  }

  function openCredits() {
    if (!purchasesHere) {
      void openAppStore();
      return;
    }
    setCreditsOpen(true);
  }

  const photoUri = useCallback((fileName: string): string | null => {
    const known = photoUris.current.get(fileName);
    if (known !== undefined) return known;
    const chat = chatRef.current;
    if (!chat) return null;
    const uri = cachedChatPhotoUri(fileName, () => chat.readPhoto(fileName));
    photoUris.current.set(fileName, uri);
    return uri;
  }, []);

  const kinds = useMemo(() => {
    const present = new Set(candidates.map((c) => c.kind));
    return (['link', 'text', 'photo'] as const).filter((kind) => present.has(kind));
  }, [candidates]);

  const visible = useMemo(
    () => (filter === 'all' ? candidates : candidates.filter((c) => c.kind === filter)),
    [candidates, filter],
  );

  const selectedCount = useMemo(
    () => candidates.filter((c) => selected.has(c.id) && !c.alreadySaved).length,
    [candidates, selected],
  );

  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const widthStyle = isMediumUp ? { maxWidth: FormContentWidth, width: '100%' as const, alignSelf: 'center' as const } : undefined;

  if (!authLoading && !user) {
    return (
      <Screen edges={['left', 'right', 'bottom']} dense className="items-center justify-center px-8">
        <View
          className="mb-5 h-16 w-16 items-center justify-center rounded-[22px]"
          style={{ backgroundColor: colors.primarySoft }}
          accessible={false}
          importantForAccessibility="no-hide-descendants"
        >
          <Ionicons name="logo-whatsapp" size={30} color={colors.primary} />
        </View>
        <Text className="mb-6 text-center text-base leading-6" style={{ color: colors.text }}>
          {t('whatsappImport.signInRequired')}
        </Text>
        <Pressable
          trackId="whatsapp_import.sign_in"
          onPress={() => router.push('/auth?mode=signin&reason=extract_limit')}
          accessibilityRole="button"
          className="min-h-12 items-center justify-center rounded-3xl px-6 py-3.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-base font-bold" style={{ color: colors.onPrimary }}>
            {t('auth.signIn')}
          </Text>
        </Pressable>
      </Screen>
    );
  }

  if (phase === 'reading' || authLoading) {
    return (
      <Screen edges={['left', 'right', 'bottom']} dense className="items-center justify-center px-8">
        <ActivityIndicator color={colors.primary} size="large" />
        {phase === 'reading' ? (
          <Text className="mt-4 text-center text-sm" style={{ color: colors.textSecondary }} accessibilityLiveRegion="polite">
            {t('whatsappImport.reading')}
          </Text>
        ) : null}
      </Screen>
    );
  }

  if (phase === 'intro') {
    const steps = [
      { key: 'iphone', icon: 'logo-apple' as const, text: t('whatsappImport.howToIphone') },
      { key: 'android', icon: 'logo-android' as const, text: t('whatsappImport.howToAndroid') },
      { key: 'media', icon: 'images-outline' as const, text: t('whatsappImport.howToMedia') },
      { key: 'share', icon: 'share-outline' as const, text: t('whatsappImport.howToShareMobile') },
    ];
    return (
      <Screen edges={['left', 'right', 'bottom']} dense>
        <ScrollView className="flex-1" contentContainerClassName="px-5 pb-8 pt-4" contentContainerStyle={widthStyle}>
          <View className="mb-4 flex-row items-center gap-3">
            <View
              className="h-12 w-12 items-center justify-center rounded-[16px]"
              style={{ backgroundColor: colors.primarySoft }}
              accessible={false}
              importantForAccessibility="no-hide-descendants"
            >
              <Ionicons name="logo-whatsapp" size={24} color={colors.primary} />
            </View>
            <Text className="min-w-0 flex-1 text-sm leading-5" style={{ color: colors.textSecondary, ...rtlText }}>
              {t('whatsappImport.entryBody')}
            </Text>
          </View>

          <View className="rounded-[22px] p-4" style={{ backgroundColor: colors.surface }}>
            <Text
              accessibilityRole="header"
              className="mb-3 text-base font-bold"
              style={{ color: colors.text, ...rtlText }}
            >
              {t('whatsappImport.howToTitle')}
            </Text>
            {steps.map((step) => (
              <View key={step.key} className="mb-2.5 flex-row items-start gap-3">
                <Ionicons
                  name={step.icon}
                  size={18}
                  color={colors.primary}
                  style={{ marginTop: 1 }}
                  accessible={false}
                  importantForAccessibility="no"
                />
                <Text className="min-w-0 flex-1 text-sm leading-5" style={{ color: colors.text, ...rtlText }}>
                  {step.text}
                </Text>
              </View>
            ))}
          </View>

          <View
            className="mt-3 flex-row items-start gap-2.5 rounded-[22px] px-4 py-3"
            style={{ backgroundColor: colors.accentSoft }}
          >
            <Ionicons
              name="lock-closed-outline"
              size={16}
              color={colors.accentText}
              style={{ marginTop: 2 }}
              accessible={false}
              importantForAccessibility="no"
            />
            <Text className="min-w-0 flex-1 text-xs leading-5" style={{ color: colors.text, ...rtlText }}>
              {t('whatsappImport.privacyNote')}
            </Text>
          </View>

          {error ? (
            <View
              className="mt-3 rounded-[22px] px-4 py-3"
              style={{ backgroundColor: colors.dangerSoft }}
              accessibilityLiveRegion="polite"
            >
              <Text className="text-sm leading-5" style={{ color: colors.danger, ...rtlText }}>
                {error}
              </Text>
            </View>
          ) : null}

          <Pressable
            trackId="whatsapp_import.choose_file"
            onPress={() => void chooseFile()}
            accessibilityRole="button"
            className="mt-5 min-h-12 flex-row items-center justify-center gap-2 rounded-[18px] px-5 py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Ionicons name="document-attach-outline" size={18} color={colors.onPrimary} accessible={false} />
            <Text className="text-base font-bold" style={{ color: colors.onPrimary }}>
              {t('whatsappImport.chooseFile')}
            </Text>
          </Pressable>
        </ScrollView>
      </Screen>
    );
  }

  if (phase === 'importing' || phase === 'done') {
    const p = progress ?? emptyProgress(batch);
    // Not started yet: stopped, or the item that found the credits had run out (nothing was charged for it).
    const waiting = batch.filter((item) => p.items[item.id] === 'waiting' || p.items[item.id] === 'out_of_credits');
    const failed = batch.filter((item) => p.items[item.id] === 'failed');
    const savedCount = p.saved + p.alreadySaved;
    const fraction = p.total > 0 ? p.done / p.total : 0;

    return (
      <Screen edges={['left', 'right', 'bottom']} dense>
        <View className="flex-1" style={widthStyle}>
          <View className="px-5 pb-3 pt-4">
            {phase === 'importing' ? (
              <>
                <Text
                  className="text-lg font-bold"
                  style={{ color: colors.text, ...rtlText }}
                  accessibilityLiveRegion="polite"
                >
                  {t('whatsappImport.importing', { done: p.done, total: p.total })}
                </Text>
                <View
                  className="mt-3 h-2 overflow-hidden rounded-full"
                  style={{ backgroundColor: colors.backgroundElement }}
                  accessibilityRole="progressbar"
                  accessibilityValue={{ min: 0, max: p.total, now: p.done }}
                >
                  <View
                    className="h-2 rounded-full"
                    style={{ width: `${Math.round(fraction * 100)}%`, backgroundColor: colors.primary }}
                  />
                </View>
                <Text className="mt-2 text-xs leading-4" style={{ color: colors.textSecondary, ...rtlText }}>
                  {t('whatsappImport.keepOpenMobile')}
                </Text>
              </>
            ) : (
              <>
                <Text
                  accessibilityRole="header"
                  className="text-[22px] font-bold tracking-tight"
                  style={{ color: colors.text, ...rtlText }}
                >
                  {t('whatsappImport.doneTitle')}
                </Text>
                <Text className="mt-1 text-sm leading-5" style={{ color: colors.text, ...rtlText }}>
                  {t('whatsappImport.doneSaved', { count: savedCount })}
                </Text>
                {p.failed > 0 ? (
                  <Text className="mt-0.5 text-sm leading-5" style={{ color: colors.danger, ...rtlText }}>
                    {t('whatsappImport.doneFailed', { count: p.failed })}
                  </Text>
                ) : null}
                {p.stoppedForCredits ? (
                  <Text className="mt-0.5 text-sm leading-5" style={{ color: colors.textSecondary, ...rtlText }}>
                    {t(dailyLimit ? 'whatsappImport.doneDailyLimit' : 'whatsappImport.doneOutOfCredits')}
                  </Text>
                ) : p.cancelled && waiting.length > 0 ? (
                  <Text className="mt-0.5 text-sm leading-5" style={{ color: colors.textSecondary, ...rtlText }}>
                    {t('whatsappImport.doneStopped')}
                  </Text>
                ) : null}
              </>
            )}
          </View>

          <FlatList
            data={batch}
            keyExtractor={(item) => item.id}
            className="flex-1"
            contentContainerClassName="px-5 pb-4"
            renderItem={({ item }) => (
              <CandidateRow
                candidate={item}
                language={language}
                photoUri={photoUri}
                state={p.items[item.id] ?? 'waiting'}
              />
            )}
          />

          <View className="gap-2.5 border-t px-5 pb-2 pt-3" style={{ borderColor: colors.border }}>
            {phase === 'importing' ? (
              <SecondaryButton
                trackId="whatsapp_import.stop"
                label={t('whatsappImport.stop')}
                onPress={() => abortRef.current?.abort()}
              />
            ) : (
              <>
                {failed.length > 0 ? (
                  <PrimaryButton
                    trackId="whatsapp_import.retry_failed"
                    label={t('whatsappImport.retryFailed')}
                    onPress={() => void runBatch(failed)}
                  />
                ) : null}
                {p.stoppedForCredits && !dailyLimit ? (
                  <PrimaryButton
                    trackId="whatsapp_import.get_credits"
                    label={t('whatsappImport.getCredits')}
                    onPress={openCredits}
                  />
                ) : null}
                {waiting.length > 0 ? (
                  <SecondaryButton
                    trackId="whatsapp_import.import_rest"
                    label={t('whatsappImport.import', { count: waiting.length })}
                    onPress={() => void runBatch(waiting)}
                  />
                ) : null}
                <SecondaryButton
                  trackId="whatsapp_import.go_to_library"
                  label={t('whatsappImport.goToLibrary')}
                  onPress={() => router.dismissTo('/')}
                />
                <Pressable
                  trackId="whatsapp_import.choose_another"
                  onPress={chooseAnother}
                  accessibilityRole="button"
                  className="min-h-11 items-center justify-center active:opacity-70"
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>
                    {t('whatsappImport.chooseAnother')}
                  </Text>
                </Pressable>
              </>
            )}
          </View>
        </View>
        <TokenPurchaseSheet visible={creditsOpen} onClose={() => setCreditsOpen(false)} onPurchased={() => refreshProfile()} />
      </Screen>
    );
  }

  // Review
  const notEnough = totalCredits != null && selectedCount > totalCredits;
  const visibleSelectable = visible.filter((c) => !c.alreadySaved);
  const kindLabel: Record<KindFilter, string> = {
    all: t('whatsappImport.kindAll'),
    link: t('whatsappImport.kindLink'),
    text: t('whatsappImport.kindText'),
    photo: t('whatsappImport.kindPhoto'),
  };

  return (
    <Screen edges={['left', 'right', 'bottom']} dense>
      <View className="flex-1" style={widthStyle}>
        <FlatList
          data={visible}
          keyExtractor={(item) => item.id}
          className="flex-1"
          contentContainerClassName="px-5 pb-4"
          initialNumToRender={12}
          windowSize={7}
          ListHeaderComponent={
            <View className="pb-2 pt-4">
              <Text
                accessibilityRole="header"
                className="text-[22px] font-bold tracking-tight"
                style={{ color: colors.text, ...rtlText }}
              >
                {t('whatsappImport.found', { count: candidates.length })}
              </Text>
              {kinds.length > 1 ? (
                <ScrollView horizontal showsHorizontalScrollIndicator={false} className="mt-3" contentContainerClassName="gap-2">
                  {(['all', ...kinds] as KindFilter[]).map((kind) => {
                    const on = filter === kind;
                    return (
                      <Pressable
                        key={kind}
                        trackId={`whatsapp_import.filter.${kind}`}
                        onPress={() => setFilter(kind)}
                        accessibilityRole="button"
                        accessibilityState={{ selected: on }}
                        className="min-h-9 items-center justify-center rounded-full px-4 active:opacity-80"
                        style={{ backgroundColor: on ? colors.primary : colors.surface }}
                      >
                        <Text className="text-sm font-semibold" style={{ color: on ? colors.onPrimary : colors.text }}>
                          {kindLabel[kind]}
                        </Text>
                      </Pressable>
                    );
                  })}
                </ScrollView>
              ) : null}
              <View className="mt-3 flex-row gap-4">
                <Pressable
                  trackId="whatsapp_import.select_all"
                  onPress={() =>
                    setSelected((prev) => new Set([...prev, ...visibleSelectable.map((c) => c.id)]))
                  }
                  accessibilityRole="button"
                  hitSlop={8}
                  className="min-h-9 justify-center active:opacity-70"
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>
                    {t('whatsappImport.selectAll')}
                  </Text>
                </Pressable>
                <Pressable
                  trackId="whatsapp_import.clear"
                  onPress={() => {
                    const ids = new Set(visible.map((c) => c.id));
                    setSelected((prev) => new Set([...prev].filter((id) => !ids.has(id))));
                  }}
                  accessibilityRole="button"
                  hitSlop={8}
                  className="min-h-9 justify-center active:opacity-70"
                >
                  <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>
                    {t('whatsappImport.clearAll')}
                  </Text>
                </Pressable>
              </View>
            </View>
          }
          renderItem={({ item }) => (
            <CandidateRow
              candidate={item}
              language={language}
              photoUri={photoUri}
              checked={selected.has(item.id) && !item.alreadySaved}
              onToggle={toggle}
            />
          )}
        />

        <View className="border-t px-5 pb-2 pt-3" style={{ borderColor: colors.border }}>
          <View className="flex-row items-center justify-between gap-3">
            <Text className="text-sm font-bold" style={{ color: colors.text }}>
              {t('whatsappImport.credits', { count: selectedCount })}
            </Text>
            {totalCredits != null ? (
              <Text className="text-sm" style={{ color: colors.textSecondary }}>
                {t('whatsappImport.balance', { count: totalCredits })}
              </Text>
            ) : null}
          </View>
          {notEnough ? (
            <View className="mt-2 rounded-[18px] px-3.5 py-2.5" style={{ backgroundColor: colors.warningSoft }}>
              <Text className="text-xs leading-5" style={{ color: colors.text, ...rtlText }}>
                {t('whatsappImport.notEnoughCredits')}
              </Text>
              <Pressable
                trackId="whatsapp_import.get_credits"
                onPress={openCredits}
                accessibilityRole={purchasesHere ? 'button' : 'link'}
                hitSlop={6}
                className="mt-1.5 self-start active:opacity-70"
              >
                <Text className="text-sm font-bold" style={{ color: colors.primaryText }}>
                  {t('whatsappImport.getCredits')}
                </Text>
              </Pressable>
            </View>
          ) : null}
          <View className="mt-3 gap-2">
            <PrimaryButton
              trackId="whatsapp_import.import"
              label={t('whatsappImport.import', { count: selectedCount })}
              onPress={startImport}
              disabled={selectedCount === 0}
            />
            <Pressable
              trackId="whatsapp_import.choose_another"
              onPress={chooseAnother}
              accessibilityRole="button"
              className="min-h-11 items-center justify-center active:opacity-70"
            >
              <Text className="text-sm font-semibold" style={{ color: colors.primaryText }}>
                {t('whatsappImport.chooseAnother')}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
      <TokenPurchaseSheet visible={creditsOpen} onClose={() => setCreditsOpen(false)} onPurchased={() => refreshProfile()} />
    </Screen>
  );
}

function PrimaryButton({
  trackId,
  label,
  onPress,
  disabled = false,
}: {
  trackId: string;
  label: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const { colors } = useThemePreference();
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      className="min-h-12 items-center justify-center rounded-[18px] px-5 active:opacity-80"
      style={{ backgroundColor: disabled ? colors.backgroundElement : colors.primary }}
    >
      <Text className="text-base font-bold" style={{ color: disabled ? colors.textSecondary : colors.onPrimary }}>
        {label}
      </Text>
    </Pressable>
  );
}

function SecondaryButton({ trackId, label, onPress }: { trackId: string; label: string; onPress: () => void }) {
  const { colors } = useThemePreference();
  return (
    <Pressable
      trackId={trackId}
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-12 items-center justify-center rounded-[18px] px-5 active:opacity-80"
      style={{ backgroundColor: colors.primarySoft }}
    >
      <Text className="text-base font-semibold" style={{ color: colors.primaryText }}>
        {label}
      </Text>
    </Pressable>
  );
}

function formatSentAt(sentAt: string | null, language: string): string | null {
  if (!sentAt) return null;
  const date = new Date(sentAt);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return date.toLocaleDateString(language, { day: 'numeric', month: 'short', year: 'numeric' });
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

const STATE_LABEL_KEYS: Record<ImportItemState, string> = {
  waiting: 'whatsappImport.itemWaiting',
  working: 'whatsappImport.itemWorking',
  saved: 'whatsappImport.itemSaved',
  already_saved: 'whatsappImport.itemAlreadySaved',
  failed: 'whatsappImport.itemFailed',
  out_of_credits: 'whatsappImport.itemWaiting',
};

/**
 * One chat item. On the review list it is a checkbox (`onToggle`); during and after the import it shows the item's
 * state instead.
 */
const CandidateRow = memo(function CandidateRow({
  candidate,
  language,
  photoUri,
  checked = false,
  onToggle,
  state,
}: {
  candidate: RecipeCandidate;
  language: string;
  photoUri: (fileName: string) => string | null;
  checked?: boolean;
  onToggle?: (id: string) => void;
  state?: ImportItemState;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign, writingDirection } = useRtl();
  const date = formatSentAt(candidate.sentAt, language);
  const byline = date ? t('whatsappImport.sentBy', { sender: candidate.sender, date }) : candidate.sender;
  const disabled = candidate.alreadySaved && !state;
  const preview = candidate.preview.trim() || candidate.text?.trim() || candidate.url || '';
  const stateLabel = state ? t(STATE_LABEL_KEYS[state]) : null;
  const stateColor =
    state === 'saved' || state === 'already_saved'
      ? colors.success
      : state === 'failed'
        ? colors.danger
        : colors.textSecondary;

  const body = (
    <>
      {onToggle ? (
        <View
          className="h-6 w-6 items-center justify-center rounded-md border-2"
          style={{
            borderColor: checked ? colors.primary : colors.textSecondary,
            backgroundColor: checked ? colors.primary : 'transparent',
            opacity: disabled ? 0.35 : 1,
          }}
        >
          {checked ? <Ionicons name="checkmark" size={14} color={colors.onPrimary} /> : null}
        </View>
      ) : null}
      <CandidateThumb candidate={candidate} photoUri={photoUri} />
      <View className="min-w-0 flex-1">
        <Text
          className="text-sm font-semibold"
          style={{ color: colors.text, textAlign, writingDirection }}
          numberOfLines={2}
        >
          {preview}
        </Text>
        <Text className="mt-0.5 text-xs" style={{ color: colors.textSecondary, textAlign }} numberOfLines={1}>
          {byline}
        </Text>
        {disabled ? (
          <Text className="mt-0.5 text-xs font-semibold" style={{ color: colors.success, textAlign }}>
            {t('whatsappImport.alreadySaved')}
          </Text>
        ) : null}
      </View>
      {stateLabel ? (
        <View className="flex-row items-center gap-1.5">
          {state === 'working' ? <ActivityIndicator size="small" color={colors.primary} /> : null}
          <Text className="text-xs font-semibold" style={{ color: stateColor }}>
            {stateLabel}
          </Text>
        </View>
      ) : null}
    </>
  );

  const rowClass = 'mb-2 flex-row items-center gap-3 rounded-[20px] border px-3 py-2.5';
  const rowStyle = { backgroundColor: colors.frosted, borderColor: colors.frostedBorder };

  if (!onToggle) {
    return (
      <View className={rowClass} style={rowStyle} accessible accessibilityLabel={`${preview}, ${byline}, ${stateLabel ?? ''}`}>
        {body}
      </View>
    );
  }

  return (
    <Pressable
      trackId="whatsapp_import.item.toggle"
      onPress={() => onToggle(candidate.id)}
      disabled={disabled}
      accessibilityRole="checkbox"
      accessibilityState={{ checked, disabled }}
      accessibilityLabel={`${preview}, ${byline}${disabled ? `, ${t('whatsappImport.alreadySaved')}` : ''}`}
      className={`${rowClass} active:opacity-80`}
      style={rowStyle}
    >
      {body}
    </Pressable>
  );
});

/** A photo's thumbnail is unpacked from the .zip only when its row is on screen. */
function CandidateThumb({
  candidate,
  photoUri,
}: {
  candidate: RecipeCandidate;
  photoUri: (fileName: string) => string | null;
}) {
  const { colors } = useThemePreference();
  const [uri, setUri] = useState<string | null>(null);
  const fileName = candidate.kind === 'photo' ? candidate.photo?.fileName : undefined;

  useEffect(() => {
    if (!fileName) return;
    let active = true;
    // After the row has drawn, so scrolling stays smooth while photos unpack.
    const timer = setTimeout(() => {
      const next = photoUri(fileName);
      if (active) setUri(next);
    }, 0);
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [fileName, photoUri]);

  if (uri) {
    return (
      <Image
        source={{ uri }}
        style={{ width: 48, height: 48, borderRadius: 12 }}
        contentFit="cover"
        accessible={false}
      />
    );
  }

  const icon: keyof typeof Ionicons.glyphMap =
    candidate.kind === 'link'
      ? PLATFORM_ICONS[candidate.platform ?? 'web']
      : candidate.kind === 'text'
        ? 'document-text-outline'
        : 'image-outline';
  return (
    <View
      className="h-12 w-12 items-center justify-center rounded-[12px]"
      style={{ backgroundColor: colors.primarySoft }}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
    >
      <Ionicons name={icon} size={20} color={colors.primary} />
    </View>
  );
}
