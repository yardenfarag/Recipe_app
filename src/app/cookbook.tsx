import Ionicons from '@expo/vector-icons/Ionicons';
import * as Localization from 'expo-localization';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  View,
} from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FieldInput } from '@/components/text-input';
import { RecipeImage } from '@/components/RecipeImage';
import { Screen } from '@/components/Screen';
import { SelectRecipesList } from '@/components/SelectRecipesList';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE } from '@/components/ui/tokens';
import { FormContentWidth } from '@/constants/theme';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useCollections } from '@/hooks/useCollections';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { useUnitSystemPreference } from '@/hooks/useUnitSystemPreference';
import { useRecipes } from '@/hooks/useRecipes';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { isRtlAppLanguage } from '@shared/lib/appLanguages';
import {
  buildCookbookHtml,
  cookbookPageSizeForLocale,
  toCookbookHtmlRecipe,
} from '@shared/lib/cookbook/buildCookbookHtml';
import { cookbookNutritionLabel } from '@shared/lib/cookbook/cookbookDocument';
import { embedRecipeImages } from '@/lib/cookbook/embedRecipeImages';
import { exportCookbookPdf } from '@/lib/cookbook/exportCookbookPdf';
import { translateAppError } from '@shared/lib/translateAppError';
import type { Platform as RecipePlatform } from '@shared/types/recipe';

const STEPS = 3;

export default function CookbookScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { isMediumUp } = useBreakpoint();
  const { recipes, loading } = useRecipes();
  const { collections } = useCollections();
  const { system: measurementSystem } = useMeasurementPreference();
  const { units } = useUnitSystemPreference();
  const { language } = useLanguagePreference();

  const [step, setStep] = useState(0);
  const [title, setTitle] = useState(t('cookbook.defaultTitle'));
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [generating, setGenerating] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [successOpen, setSuccessOpen] = useState(false);
  const [errorOpen, setErrorOpen] = useState(false);
  const stepMounted = useRef(false);

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
      facebook: t('cookbook.platformFacebook'),
      pinterest: t('cookbook.platformPinterest'),
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
      announce(t('cookbook.titleRequired'), { liveRegion: true });
      return;
    }
    if (step === 1 && selectedIds.length === 0) {
      setError(t('cookbook.pickRecipes'));
      announce(t('cookbook.pickRecipes'), { liveRegion: true });
      return;
    }
    setStep((prev) => Math.min(prev + 1, STEPS - 1));
  }

  async function handleGenerate() {
    if (selectedRecipes.length === 0) {
      setError(t('cookbook.pickRecipes'));
      announce(t('cookbook.pickRecipes'), { liveRegion: true });
      return;
    }

    setGenerating(true);
    announce(t('cookbook.generating'));
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
          units,
          imageDataUri: images[index],
          servingsLabel:
            recipe.servings > 0 ? t('cookbook.servings', { count: recipe.servings }) : '',
          nutritionLabel: cookbookNutritionLabel(recipe, t),
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
    router.dismissTo('/');
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

  // Focus stays on the footer button when the step changes, so read out where we landed.
  useEffect(() => {
    if (!stepMounted.current) {
      stepMounted.current = true;
      return;
    }
    announce(`${t('cookbook.stepOf', { current: step + 1, total: STEPS })}. ${stepTitle}`);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  if (loading) {
    return (
      <Screen edges={['left', 'right', 'bottom']} style={{ alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={colors.primary} size="large" accessibilityLabel={t('a11y.loading')} />
      </Screen>
    );
  }

  if (recipes.length === 0) {
    return (
      <Screen edges={['left', 'right', 'bottom']} style={{ justifyContent: 'center', paddingHorizontal: 20 }}>
        <Tile padding={24} style={{ alignItems: 'center', gap: 12 }}>
          <View
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.backgroundElement,
            }}
            accessible={false}
            importantForAccessibility="no-hide-descendants"
          >
            <Ionicons name="book-outline" size={26} color={colors.textSecondary} />
          </View>
          <Text variant="h2" align="center">
            {t('cookbook.title')}
          </Text>
          <Text variant="bodySmall" tone="muted" align="center">
            {t('cookbook.emptyLibrary')}
          </Text>
          <Button trackId="cookbook.empty.add_recipe" icon="add" onPress={() => router.push('/add')} style={{ marginTop: 4 }}>
            {t('library.snapFirst')}
          </Button>
        </Tile>
      </Screen>
    );
  }

  return (
    <Screen edges={['left', 'right', 'bottom']}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View
          style={[
            { flex: 1, paddingHorizontal: 20, paddingTop: 12 },
            isMediumUp ? { maxWidth: FormContentWidth, width: '100%', alignSelf: 'center' } : null,
          ]}
        >
          {/* Where we are: three bars that fill as the steps go by, then the step's name and what it's for. */}
          <View style={{ gap: 10, marginBottom: 16 }}>
            <View
              accessible={false}
              importantForAccessibility="no-hide-descendants"
              style={{ flexDirection: 'row', gap: 6 }}
            >
              {Array.from({ length: STEPS }, (_, index) => (
                <View
                  key={index}
                  style={{
                    flex: 1,
                    height: 4,
                    borderRadius: 2,
                    backgroundColor: index <= step ? colors.primary : colors.backgroundElement,
                  }}
                />
              ))}
            </View>
            <TileLabel>{t('cookbook.stepOf', { current: step + 1, total: STEPS })}</TileLabel>
            <Text variant="h2">{stepTitle}</Text>
            <Text variant="bodySmall" tone="muted">
              {stepHint}
            </Text>
          </View>

          {step === 0 ? (
            <View style={{ flex: 1 }}>
              <Tile padding={16} style={{ gap: 10 }}>
                <FieldInput
                  value={title}
                  onChangeText={(value) => {
                    setTitle(value);
                    if (error) setError(null);
                  }}
                  placeholder={t('cookbook.titlePlaceholder')}
                  accessibilityLabel={t('cookbook.titlePlaceholder')}
                  autoCapitalize="sentences"
                  maxLength={80}
                  invalid={Boolean(error)}
                  leading={<Ionicons name="book-outline" size={18} color={colors.textSecondary} />}
                />
              </Tile>
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
            <ScrollView style={{ flex: 1 }} keyboardShouldPersistTaps="handled" contentContainerStyle={{ gap: 12 }}>
              {Platform.OS === 'web' ? (
                <Text variant="caption" tone="muted">
                  {t('cookbook.webPrintHint')}
                </Text>
              ) : null}
              <Tile style={{ paddingHorizontal: 8, paddingVertical: 4 }}>
                {selectedRecipes.map((recipe, index) => {
                  const name = recipe.display_title?.trim() || recipe.title;
                  return (
                    <View key={recipe.id}>
                      {index > 0 ? (
                        <View
                          accessible={false}
                          importantForAccessibility="no"
                          style={{ height: HAIRLINE, backgroundColor: colors.border, marginHorizontal: 8 }}
                        />
                      ) : null}
                      <View
                        style={{
                          flexDirection: 'row',
                          alignItems: 'center',
                          gap: 12,
                          paddingVertical: 8,
                          paddingStart: 8,
                        }}
                      >
                        <View accessible={false} importantForAccessibility="no-hide-descendants">
                          {recipe.image_url ? (
                            <RecipeImage
                              uri={recipe.image_url}
                              variant="compact"
                              borderRadius={12}
                              aiGenerated={recipe.image_generated}
                            />
                          ) : (
                            <View
                              style={{
                                width: 48,
                                height: 48,
                                borderRadius: 12,
                                alignItems: 'center',
                                justifyContent: 'center',
                                backgroundColor: colors.backgroundElement,
                              }}
                            >
                              <Ionicons name="restaurant-outline" size={20} color={colors.textSecondary} />
                            </View>
                          )}
                        </View>
                        <View
                          style={{ flex: 1, minWidth: 0, gap: 2 }}
                          accessible
                          accessibilityLabel={`${index + 1}. ${name}`}
                        >
                          <Text variant="label">{String(index + 1)}</Text>
                          <Text variant="bodySmall" weight="semibold" numberOfLines={2}>
                            {name}
                          </Text>
                        </View>
                        <IconButton
                          trackId="cookbook.recipe.move_up"
                          icon="chevron-up"
                          iconSize={20}
                          label={t('a11y.moveRecipeUp', { name })}
                          disabled={index === 0}
                          onPress={() => moveSelected(index, -1)}
                        />
                        <IconButton
                          trackId="cookbook.recipe.move_down"
                          icon="chevron-down"
                          iconSize={20}
                          label={t('a11y.moveRecipeDown', { name })}
                          disabled={index === selectedRecipes.length - 1}
                          onPress={() => moveSelected(index, 1)}
                        />
                      </View>
                    </View>
                  );
                })}
              </Tile>
            </ScrollView>
          ) : null}

          <View accessibilityLiveRegion="polite">
            {error ? (
              <Text variant="bodySmall" tone="danger" style={{ marginTop: 10 }}>
                {error}
              </Text>
            ) : null}
          </View>

          {generating ? (
            <View
              style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}
              accessibilityLiveRegion="polite"
            >
              <ActivityIndicator color={colors.primary} />
              <Text variant="bodySmall" tone="muted" style={{ flex: 1 }}>
                {progress
                  ? t('cookbook.generatingProgress', {
                      done: progress.done,
                      total: progress.total,
                    })
                  : t('cookbook.generating')}
              </Text>
            </View>
          ) : null}

          <View style={{ flexDirection: 'row', gap: 12, paddingVertical: 16 }}>
            {step > 0 ? (
              <Button
                trackId="cookbook.back"
                variant="outline"
                size="lg"
                icon="chevron-back"
                disabled={generating}
                onPress={() => {
                  setError(null);
                  setStep((prev) => prev - 1);
                }}
                style={{ flex: 1 }}
              >
                {t('common.back')}
              </Button>
            ) : null}
            <Button
              trackId={step === STEPS - 1 ? 'cookbook.generate' : 'cookbook.next'}
              size="lg"
              busy={generating}
              icon={step === STEPS - 1 ? 'document-text-outline' : undefined}
              iconEnd={step === STEPS - 1 ? undefined : 'chevron-forward'}
              accessibilityLabel={step === STEPS - 1 ? t('cookbook.generate') : t('common.continue')}
              onPress={() => (step === STEPS - 1 ? void handleGenerate() : goNext())}
              style={{ flex: step > 0 ? 1.4 : 1 }}
            >
              {step === STEPS - 1 ? t('cookbook.generate') : t('common.continue')}
            </Button>
          </View>
        </View>
      </KeyboardAvoidingView>

      <ConfirmDialog
        trackId="cookbook.success_dialog"
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
        trackId="cookbook.error_dialog"
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
