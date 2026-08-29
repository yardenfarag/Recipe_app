import Ionicons from '@expo/vector-icons/Ionicons';
import * as Localization from 'expo-localization';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { RecipeImage } from '@/components/RecipeImage';
import { Screen } from '@/components/Screen';
import { SelectRecipesList } from '@/components/SelectRecipesList';
import { TextInput } from '@/components/text-input';
import { FormContentWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCollections } from '@/hooks/useCollections';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useRecipes } from '@/hooks/useRecipes';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { isRtlAppLanguage } from '@/lib/appLanguages';
import {
  buildCookbookHtml,
  cookbookPageSizeForLocale,
  toCookbookHtmlRecipe,
} from '@/lib/cookbook/buildCookbookHtml';
import { embedRecipeImages } from '@/lib/cookbook/embedRecipeImages';
import { exportCookbookPdf } from '@/lib/cookbook/exportCookbookPdf';
import { translateAppError } from '@/lib/translateAppError';
import type { Platform as RecipePlatform } from '@/types/recipe';

const STEPS = 3;

export default function CookbookScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const { recipes, loading } = useRecipes();
  const { collections } = useCollections();
  const { system: measurementSystem } = useMeasurementPreference();
  const { language } = useLanguagePreference();
  const { rtl, textAlign } = useRtl();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(t('cookbook.defaultTitle'));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);

  const selectedRecipes = useMemo(
    () =>
      selectedIds
        .map((id) => recipes.find((recipe) => recipe.id === id))
        .filter((recipe): recipe is NonNullable<typeof recipe> => Boolean(recipe)),
    [recipes, selectedIds],
  );

  const platformLabels = useMemo(
    (): Partial<Record<RecipePlatform, string>> => ({
      youtube: t('cookbook.platformYoutube'),
      instagram: t('cookbook.platformInstagram'),
      tiktok: t('cookbook.platformTiktok'),
      web: t('cookbook.platformWeb'),
      photo: t('cookbook.platformPhoto'),
    }),
    [t],
  );

  function moveSelected(index: number, direction: -1 | 1) {
    const swap = index + direction;
    if (swap < 0 || swap >= selectedIds.length) return;
    const next = [...selectedIds];
    const current = next[index];
    const other = next[swap];
    if (current == null || other == null) return;
    next[index] = other;
    next[swap] = current;
    setSelectedIds(next);
  }

  function goNext() {
    setError(null);
    if (step === 0 && !title.trim()) {
      setError(t('cookbook.titleRequired'));
      return;
    }
    if (step === 1 && selectedIds.length === 0) {
      setError(t('cookbook.pickRecipes'));
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS - 1));
  }

  async function handleGenerate() {
    if (selectedRecipes.length === 0) {
      setError(t('cookbook.pickRecipes'));
      return;
    }

    setGenerating(true);
    setError(null);
    setProgress({ done: 0, total: selectedRecipes.length });

    try {
      const images = await embedRecipeImages(
        selectedRecipes.map((recipe) => recipe.image_url),
        (done, total) => setProgress({ done, total }),
      );
      const pageSize = cookbookPageSizeForLocale(Localization.getLocales()[0]?.languageTag);
      const htmlRecipes = selectedRecipes.map((recipe, index) =>
        toCookbookHtmlRecipe(recipe, {
          language,
          measurementSystem,
          imageDataUri: images[index],
          servingsLabel:
            recipe.servings > 0 ? t('cookbook.servings', { count: recipe.servings }) : '',
          durationMin: t('recipe.durationMin'),
          durationHr: t('recipe.durationHr'),
          platformLabels,
        }),
      );

      await exportCookbookPdf({
        html: buildCookbookHtml({
          title: title.trim(),
          recipes: htmlRecipes,
          language,
          rtl: isRtlAppLanguage(language),
          pageSize,
          copy: {
            brand: t('cookbook.madeWith'),
            recipeCount:
              selectedRecipes.length === 1
                ? t('cookbook.recipeCountOne', { count: selectedRecipes.length })
                : t('cookbook.recipeCountOther', { count: selectedRecipes.length }),
            ingredientsHeading: t('cookbook.ingredients'),
            stepsHeading: t('cookbook.steps'),
          },
        }),
        title: title.trim(),
        pageSize,
      });
      setSuccessOpen(true);
    } catch (err) {
      const message = translateAppError(err, t, 'cookbook.generateFailed');
      setError(message);
      setErrorOpen(true);
    } finally {
      setGenerating(false);
      setProgress(null);
    }
  }

  function goToLibrary() {
    setSuccessOpen(false);
    setErrorOpen(false);
    router.replace('/');
  }

  const stepTitle =
    step === 0
      ? t('cookbook.titleStepTitle')
      : step === 1
        ? t('cookbook.pickStepTitle')
        : t('cookbook.reviewStepTitle');
  const stepHint =
    step === 0
      ? t('cookbook.titleStepHint')
      : step === 1
        ? t('cookbook.pickStepHint')
        : t('cookbook.reviewStepHint');

  if (loading) {
    return (
      <Screen edges={['left', 'right', 'bottom']} dense className="items-center justify-center">
        <ActivityIndicator color={colors.primary} size="large" />
      </Screen>
    );
  }

  if (recipes.length === 0) {
    return (
      <Screen edges={['left', 'right', 'bottom']} dense className="items-center justify-center px-8">
        <View
          className="mb-5 h-16 w-16 items-center justify-center rounded-[22px]"
          style={{ backgroundColor: colors.primarySoft }}
        >
          <Ionicons name="book-outline" size={30} color={colors.primary} />
        </View>
        <Text className="mb-2 text-center text-xl font-bold" style={{ color: colors.text }}>
          {t('cookbook.title')}
        </Text>
        <Text className="mb-6 text-center text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('cookbook.emptyLibrary')}
        </Text>
        <Pressable
          onPress={() => router.push('/add')}
          className="rounded-3xl px-6 py-3.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
        >
          <Text className="text-base font-bold text-white">{t('library.snapFirst')}</Text>
        </Pressable>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']} dense>
      <KeyboardAvoidingView
        className="flex-1"
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          className="flex-1 px-5 pt-4"
          style={
            isMediumUp
              ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' }
              : undefined
          }
        >
          <Text className="text-xs font-semibold" style={{ color: colors.textSecondary }}>
            {t('cookbook.stepOf', { current: step + 1, total: STEPS })}
          </Text>
          <Text
            className="mt-1 text-[22px] font-bold tracking-tight"
            style={{ color: colors.text, textAlign }}
          >
            {stepTitle}
          </Text>
          <Text className="mb-4 mt-1 text-sm leading-5" style={{ color: colors.textSecondary, textAlign }}>
            {stepHint}
          </Text>

          {step === 0 ? (
            <View className="flex-1">
              <TextInput
                className="rounded-[20px] border px-4 py-3.5 text-base"
                style={{
                  color: colors.text,
                  backgroundColor: colors.frosted,
                  borderColor: colors.frostedBorder,
                  textAlign,
                  writingDirection: rtl ? 'rtl' : 'ltr',
                }}
                value={title}
                onChangeText={(value) => {
                  setTitle(value);
                  if (error) setError(null);
                }}
                placeholder={t('cookbook.titlePlaceholder')}
                placeholderTextColor={colors.textSecondary}
                autoCapitalize="sentences"
                maxLength={80}
              />
            </View>
          ) : null}

          {step === 1 ? (
            <SelectRecipesList
              recipes={recipes}
              collections={collections}
              selectedIds={selectedIds}
              onChangeSelectedIds={(ids) => {
                setSelectedIds(ids);
                if (error) setError(null);
              }}
            />
          ) : null}

          {step === 2 ? (
            <ScrollView className="flex-1" keyboardShouldPersistTaps="handled">
              {Platform.OS === 'web' ? (
                <Text className="mb-3 text-xs leading-4" style={{ color: colors.textSecondary }}>
                  {t('cookbook.webPrintHint')}
                </Text>
              ) : null}
              {selectedRecipes.map((recipe, index) => {
                const name = recipe.display_title?.trim() || recipe.title;
                return (
                  <View
                    key={recipe.id}
                    className="mb-2 flex-row items-center gap-3 rounded-[20px] border px-3 py-2.5"
                    style={{
                      backgroundColor: colors.frosted,
                      borderColor: colors.frostedBorder,
                    }}
                  >
                    {recipe.image_url ? (
                      <RecipeImage uri={recipe.image_url} variant="compact" borderRadius={12} />
                    ) : (
                      <View
                        className="h-12 w-12 items-center justify-center rounded-[12px]"
                        style={{ backgroundColor: colors.primarySoft }}
                      >
                        <Ionicons name="restaurant" size={20} color={colors.primary} />
                      </View>
                    )}
                    <View className="min-w-0 flex-1">
                      <Text className="text-xs" style={{ color: colors.textSecondary }}>
                        {index + 1}
                      </Text>
                      <Text
                        className="text-sm font-semibold"
                        style={{ color: colors.text }}
                        numberOfLines={2}
                      >
                        {name}
                      </Text>
                    </View>
                    <View className="flex-row">
                      <Pressable
                        onPress={() => moveSelected(index, -1)}
                        disabled={index === 0}
                        hitSlop={8}
                        accessibilityLabel={t('cookbook.moveUp')}
                        className="h-9 w-9 items-center justify-center active:opacity-70 disabled:opacity-30"
                      >
                        <Ionicons name="chevron-up" size={18} color={colors.primary} />
                      </Pressable>
                      <Pressable
                        onPress={() => moveSelected(index, 1)}
                        disabled={index === selectedRecipes.length - 1}
                        hitSlop={8}
                        accessibilityLabel={t('cookbook.moveDown')}
                        className="h-9 w-9 items-center justify-center active:opacity-70 disabled:opacity-30"
                      >
                        <Ionicons name="chevron-down" size={18} color={colors.primary} />
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </ScrollView>
          ) : null}

          {error ? (
            <Text className="mt-2 text-sm" style={{ color: colors.danger }}>
              {error}
            </Text>
          ) : null}

          {generating ? (
            <View className="mt-3 flex-row items-center gap-2">
              <ActivityIndicator color={colors.primary} />
              <Text className="flex-1 text-sm" style={{ color: colors.textSecondary }}>
                {progress
                  ? t('cookbook.generatingProgress', {
                      done: progress.done,
                      total: progress.total,
                    })
                  : t('cookbook.generating')}
              </Text>
            </View>
          ) : null}

          <View className="flex-row gap-3 py-4">
            {step > 0 ? (
              <Pressable
                onPress={() => {
                  setError(null);
                  setStep((prev) => prev - 1);
                }}
                disabled={generating}
                className="min-h-12 flex-1 items-center justify-center rounded-[18px] active:opacity-70 disabled:opacity-50"
                style={{ backgroundColor: colors.primarySoft }}
              >
                <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
                  {t('common.back')}
                </Text>
              </Pressable>
            ) : null}
            <Pressable
              onPress={() => (step === STEPS - 1 ? void handleGenerate() : goNext())}
              disabled={generating}
              className="min-h-12 flex-1 items-center justify-center rounded-[18px] active:opacity-80 disabled:opacity-50"
              style={{ backgroundColor: colors.primary }}
            >
              {generating ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text className="text-base font-bold text-white">
                  {step === STEPS - 1 ? t('cookbook.generate') : t('common.continue')}
                </Text>
              )}
            </Pressable>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        visible={successOpen}
        title={t('cookbook.successTitle')}
        message={
          Platform.OS === 'web' ? t('cookbook.successBodyWeb') : t('cookbook.successBody')
        }
        confirmLabel={t('cookbook.backToLibrary')}
        cancelLabel={t('cookbook.stayHere')}
        onConfirm={goToLibrary}
        onCancel={() => setSuccessOpen(false)}
      />
      <ConfirmDialog
        visible={errorOpen}
        title={t('cookbook.errorTitle')}
        message={error ?? t('cookbook.generateFailed')}
        confirmLabel={t('common.tryAgainAction')}
        cancelLabel={t('cookbook.backToLibrary')}
        onConfirm={() => setErrorOpen(false)}
        onCancel={goToLibrary}
      />
    </Screen>
  );
}
