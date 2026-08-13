import { router, useNavigation } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Edge } from 'react-native-safe-area-context';

import { RecipeView } from '@/components/RecipeView';
import { Screen } from '@/components/Screen';
import { StackHeaderBackButton } from '@/components/StackHeaderBackButton';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useLocalizedRecipe } from '@/hooks/useLocalizedRecipe';
import { useThemePreference } from '@/hooks/useThemePreference';
import { DEFAULT_SOURCE_LANGUAGE } from '@/lib/appLanguages';
import { confirmAction } from '@/lib/confirmAction';
import { ensureRecipeTranslation } from '@/lib/ensureRecipeTranslation';
import { recipeContentEquals } from '@/lib/recipeContentEquals';
import {
  clearRecipeDraft,
  getRecipeDraft,
  peekRecipeDraft,
  setRecipeDraft,
} from '@/lib/recipeDraft';
import { isRecipeLanguageCode } from '@/lib/recipeLanguages';
import { resolveRecipeSourceLanguage } from '@/lib/recipeSourceLanguage';
import { saveRecipeDraft } from '@/lib/saveRecipeDraft';
import { supabase } from '@/lib/supabase/client';
import { ExtractedRecipe } from '@/lib/supabase/extractRecipe';
import { upsertRecipeTranslation } from '@/lib/supabase/recipeTranslations';
import type { RecipeTranslationContent } from '@/types/recipe';

/**
 * Shows a freshly extracted recipe that has NOT been saved yet.
 * Recipe payload lives in the in-memory draft store (see recipeDraft.ts).
 * Save stays fixed at the top so it is not missed while scrolling.
 */
export default function RecipePreviewScreen() {
  const { t } = useTranslation();
  const initialDraft = useRef(peekRecipeDraft()).current;
  const { colors } = useThemePreference();
  const { language: preferredLanguage } = useLanguagePreference();
  const navigation = useNavigation();
  const isWeb = Platform.OS === 'web';
  const [saving, setSaving] = useState(false);
  const saveInFlight = useRef(false);
  const [recipeToSave, setRecipeToSave] = useState<ExtractedRecipe | null>(() =>
    initialDraft
      ? {
          ...initialDraft,
          source_language: initialDraft.source_language ?? DEFAULT_SOURCE_LANGUAGE,
        }
      : null,
  );
  const [draftLoading, setDraftLoading] = useState(initialDraft === null);
  const pendingTranslation = useRef<{
    language: string;
    content: RecipeTranslationContent;
  } | null>(null);

  useEffect(() => {
    if (initialDraft) return;

    let active = true;
    void getRecipeDraft()
      .then((stored) => {
        if (active && stored) {
          setRecipeToSave({
            ...stored,
            source_language: stored.source_language ?? DEFAULT_SOURCE_LANGUAGE,
          });
        }
      })
      .finally(() => {
        if (active) setDraftLoading(false);
      });
    return () => {
      active = false;
    };
  }, [initialDraft]);

  const {
    displayContent,
    activeLanguage,
    translating,
    applyManualTranslation,
  } = useLocalizedRecipe(recipeToSave, undefined);

  useEffect(() => {
    navigation.setOptions({
      title: displayContent?.title?.trim() || recipeToSave?.title?.trim() || t('recipe.preview'),
    });
  }, [navigation, displayContent?.title, recipeToSave?.title, t]);

  useEffect(() => {
    if (displayContent && activeLanguage) {
      pendingTranslation.current = { language: activeLanguage, content: displayContent };
    } else {
      pendingTranslation.current = null;
    }
  }, [displayContent, activeLanguage]);

  const handleContentChange = useCallback(
    (content: {
      title: string;
      servings: number;
      ingredients: ExtractedRecipe['ingredients'];
      instructions: ExtractedRecipe['instructions'];
      calories?: number;
    }) => {
      setRecipeToSave((prev) => {
        if (!prev) return prev;
        if (recipeContentEquals(prev, content)) return prev;
        const next = { ...prev, ...content };
        void setRecipeDraft(next).catch((error) => {
          console.warn('[recipe-draft] update persistence failed', error);
        });
        return next;
      });
    },
    [],
  );

  const screenEdges: Edge[] = isWeb ? ['top', 'bottom'] : ['bottom'];

  if (draftLoading) {
    return (
      <Screen edges={screenEdges}>
        {isWeb ? <WebPreviewToolbar title={t('recipe.preview')} /> : null}
        <View className="flex-1 items-center justify-center">
          <ActivityIndicator color={colors.primary} />
        </View>
      </Screen>
    );
  }

  if (!recipeToSave) {
    return (
      <Screen edges={screenEdges}>
        {isWeb ? <WebPreviewToolbar title={t('recipe.preview')} /> : null}
        <View className="flex-1 items-center justify-center px-6">
          <Text className="mb-4 text-center text-base" style={{ color: colors.textSecondary }}>
            {t('recipe.noPreview')}
          </Text>
          <Pressable
            onPress={() => router.replace('/')}
            className="rounded-full px-5 py-3 active:opacity-80"
            style={{ backgroundColor: colors.primary }}
          >
            <Text className="text-sm font-bold text-white">{t('recipe.goToLibrary')}</Text>
          </Pressable>
        </View>
      </Screen>
    );
  }

  async function handleSave() {
    if (!recipeToSave || saveInFlight.current) return;

    saveInFlight.current = true;
    setSaving(true);
    try {
      const canonical: ExtractedRecipe = {
        ...recipeToSave,
        source_language: recipeToSave.source_language ?? DEFAULT_SOURCE_LANGUAGE,
      };

      // Eager translate at save if preferred language differs and we don't have overlay yet.
      let translation = pendingTranslation.current;
      if (
        !translation &&
        preferredLanguage !== resolveRecipeSourceLanguage(canonical)
      ) {
        const result = await ensureRecipeTranslation({
          recipe: canonical,
          targetLanguage: preferredLanguage,
        });
        if (result.status === 'ok') {
          translation = { language: preferredLanguage, content: result.content };
        }
      }

      const { data: userData } = await supabase.auth.getUser();

      if (!userData.user) {
        if (Platform.OS === 'web') {
          const signUp = await confirmAction(
            t('recipe.guestLimitTitle'),
            t('recipe.guestLimitBody'),
            t('auth.signUp'),
          );
          if (signUp) router.push('/auth?mode=signup&reason=save_limit');
          return;
        }
        Alert.alert(t('recipe.guestLimitTitle'), t('recipe.guestLimitBody'), [
          { text: t('common.notNow'), style: 'cancel' },
          {
            text: t('auth.signUp'),
            onPress: () => router.push('/auth?mode=signup&reason=save_limit'),
          },
        ]);
        return;
      }

      const { recipe: saved, recoveredDuplicate } = await saveRecipeDraft(canonical);
      if (translation && isRecipeLanguageCode(translation.language)) {
        try {
          await upsertRecipeTranslation(saved.id, translation.language, translation.content);
        } catch {
          Alert.alert(t('recipe.saveFailedTitle'), t('recipe.translationSaveFailed'));
        }
      }
      try {
        await clearRecipeDraft();
      } catch (error) {
        console.warn('[recipe-draft] cleanup failed', error);
      }
      router.replace(recoveredDuplicate ? `/recipe/${saved.id}` : '/?saved=1');
    } catch (err) {
      Alert.alert(
        t('recipe.saveFailedTitle'),
        err instanceof Error ? err.message : t('common.tryAgain'),
      );
    } finally {
      saveInFlight.current = false;
      setSaving(false);
    }
  }

  const previewTitle =
    displayContent?.title?.trim() || recipeToSave.title.trim() || t('recipe.preview');

  return (
    <Screen edges={screenEdges}>
      {isWeb ? (
        <WebPreviewToolbar
          title={previewTitle}
          saveLabel={t('recipe.save')}
          saving={saving}
          onSave={() => void handleSave()}
        />
      ) : (
        <View
          className="border-b px-5 py-3"
          style={{
            backgroundColor: colors.background,
            borderBottomColor: colors.frostedBorder,
            alignItems: 'center',
          }}
        >
          <Pressable
            className="w-full items-center rounded-full py-3.5 active:opacity-80"
            style={{ backgroundColor: colors.primary, maxWidth: 420 }}
            onPress={() => void handleSave()}
            disabled={saving}
            accessibilityRole="button"
            accessibilityLabel={t('recipe.save')}
          >
            {saving ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <Text className="text-base font-bold text-white">{t('recipe.save')}</Text>
            )}
          </Pressable>
        </View>
      )}

      <RecipeView
        recipe={recipeToSave}
        onContentChange={handleContentChange}
        localizedContent={displayContent}
        localizedLanguage={activeLanguage}
        translating={translating}
        onTranslationPersist={(language, content) => {
          pendingTranslation.current = { language, content };
          return applyManualTranslation(language, content);
        }}
      />
    </Screen>
  );
}

function WebPreviewToolbar({
  title,
  saveLabel,
  saving,
  onSave,
}: {
  title: string;
  saveLabel?: string;
  saving?: boolean;
  onSave?: () => void;
}) {
  const { colors } = useThemePreference();

  return (
    <View
      className="flex-row items-center gap-3 border-b px-4 py-2.5"
      style={{
        backgroundColor: colors.background,
        borderBottomColor: colors.frostedBorder,
      }}
    >
      <StackHeaderBackButton tintColor={colors.primary} />
      <Text
        className="min-w-0 flex-1 text-base font-bold"
        numberOfLines={1}
        style={{ color: colors.text }}
      >
        {title}
      </Text>
      {onSave && saveLabel ? (
        <Pressable
          className="rounded-full px-5 py-2.5 active:opacity-80"
          style={{ backgroundColor: colors.primary }}
          onPress={onSave}
          disabled={saving}
          accessibilityRole="button"
          accessibilityLabel={saveLabel}
        >
          {saving ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text className="text-sm font-bold text-white">{saveLabel}</Text>
          )}
        </Pressable>
      ) : null}
    </View>
  );
}
