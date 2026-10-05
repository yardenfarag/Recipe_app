import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { ActivityIndicator, Alert, Platform, Pressable, ScrollView, Text, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SheetModal } from '@/components/SheetModal';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { pickCompressedRecipeImage } from '@/lib/pickCompressedImage';
import { buildFridgeCatalog } from '@/lib/fridgeCatalog';
import { matchFridge, type FridgeMatchRow } from '@/lib/supabase/matchFridge';
import type { Recipe } from '@/types/recipe';

type FridgeMatchModalProps = {
  visible: boolean;
  recipes: Recipe[];
  onClose: () => void;
};

export function FridgeMatchModal({ visible, recipes, onClose }: FridgeMatchModalProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const libraryEmpty = recipes.length === 0;
  const [loading, setLoading] = useState(false);
  const [matches, setMatches] = useState<FridgeMatchRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const requestGen = useRef(0);

  function handleClose() {
    requestGen.current += 1;
    setLoading(false);
    setMatches(null);
    setError(null);
    onClose();
  }

  async function runMatch(source: 'camera' | 'library') {
    if (loading) return;
    if (recipes.length === 0) {
      setError('empty');
      return;
    }

    const image = await pickCompressedRecipeImage(source, {
      permissionTitle: t('settings.permissionNeededTitle'),
      permissionCamera: t('settings.permissionCamera'),
      permissionLibrary: t('settings.permissionLibrary'),
      readFailedTitle: t('settings.imageReadFailedTitle'),
      readFailedBody: t('snap.photoTooLarge'),
    });
    if (!image) return;

    const gen = requestGen.current + 1;
    requestGen.current = gen;
    setLoading(true);
    setError(null);
    setMatches(null);
    try {
      const result = await matchFridge(
        image.base64,
        image.mimeType,
        buildFridgeCatalog(recipes),
      );
      if (requestGen.current !== gen) return;
      if (result.code === 'daily_limit') {
        setError('limited');
        announce(t('library.fridgeMatchLimited'));
        return;
      }
      if (result.status !== 'ok') {
        setError('failed');
        announce(t('library.fridgeMatchFailed'));
        return;
      }
      const found = result.matches ?? [];
      setMatches(found);
      announce(
        found.length === 0
          ? t('library.fridgeMatchEmptyResults')
          : t('list.recipesVisible', { count: found.length }),
      );
    } catch {
      if (requestGen.current !== gen) return;
      setError('failed');
      announce(t('library.fridgeMatchFailed'));
    } finally {
      if (requestGen.current === gen) setLoading(false);
    }
  }

  function handlePick() {
    if (recipes.length === 0) {
      setError('empty');
      return;
    }
    if (Platform.OS === 'web') {
      void runMatch('library');
      return;
    }
    Alert.alert(t('library.fridgeMatchTitle'), t('library.fridgeMatchHint'), [
      { text: t('settings.takePhoto'), onPress: () => void runMatch('camera') },
      { text: t('settings.chooseLibrary'), onPress: () => void runMatch('library') },
      { text: t('common.cancel'), style: 'cancel' },
    ]);
  }

  function openRecipe(id: string) {
    handleClose();
    router.push(`/recipe/${id}`);
  }

  const recipeById = new Map(recipes.map((recipe) => [recipe.id, recipe]));

  const bodyPad = { paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24 } as const;

  return (
    <SheetModal visible={visible} onClose={handleClose} title={t('library.fridgeMatchTitle')}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ width: '100%', alignSelf: 'stretch' }}
        contentContainerStyle={bodyPad}
      >
        <Text className="text-sm leading-5" style={{ color: colors.textSecondary }}>
          {t('library.fridgeMatchHint')}
        </Text>

        {libraryEmpty || error === 'empty' ? (
          <View style={{ marginTop: 12, gap: 12 }}>
            <Text
              className="text-sm leading-5"
              style={{ color: colors.warning }}
              accessibilityLiveRegion="polite"
            >
              {t('library.fridgeMatchEmptyLibrary')}
            </Text>
            <Pressable
              onPress={() => {
                handleClose();
                router.push('/add');
              }}
              className="min-h-[44px] items-center justify-center rounded-3xl active:opacity-90"
              style={{ backgroundColor: colors.primary, alignSelf: 'stretch' }}
              accessibilityRole="button"
            >
              <Text className="text-sm font-bold" style={{ color: colors.onPrimary }}>
                {t('library.snapFirst')}
              </Text>
            </Pressable>
          </View>
        ) : null}
        {error === 'limited' ? (
          <Text
            className="mt-3 text-sm leading-5"
            style={{ color: colors.warning }}
          >
            {t('library.fridgeMatchLimited')}
          </Text>
        ) : null}
        {error === 'failed' ? (
          <Text
            className="mt-3 text-sm leading-5"
            style={{ color: colors.warning }}
          >
            {t('library.fridgeMatchFailed')}
          </Text>
        ) : null}

        {!libraryEmpty ? (
          <Pressable
            onPress={handlePick}
            disabled={loading}
            className="mt-3 min-h-[44px] flex-row items-center justify-center rounded-3xl py-3.5 active:opacity-90"
            style={{ backgroundColor: colors.primary, alignSelf: 'stretch', gap: 8 }}
            accessibilityRole="button"
            accessibilityLabel={t('library.fridgeMatchSnap')}
            accessibilityState={{ disabled: loading, busy: loading }}
          >
            {loading ? (
              <ActivityIndicator color={colors.onPrimary} />
            ) : (
              <>
                <Ionicons
                  name={Platform.OS === 'web' ? 'images-outline' : 'camera-outline'}
                  size={18}
                  color={colors.onPrimary}
                />
                <Text className="flex-shrink text-sm font-bold" style={{ color: colors.onPrimary }}>
                  {t('library.fridgeMatchSnap')}
                </Text>
              </>
            )}
          </Pressable>
        ) : null}

        {loading ? (
          <Text
            className="mt-3 text-center text-xs"
            style={{ color: colors.textSecondary }}
          >
            {t('library.fridgeMatching')}
          </Text>
        ) : null}

        {matches && matches.length === 0 ? (
          <Text
            className="mt-3 text-sm leading-5"
            style={{ color: colors.textSecondary }}
            accessibilityLiveRegion="polite"
          >
            {t('library.fridgeMatchEmptyResults')}
          </Text>
        ) : null}

        {matches && matches.length > 0 ? (
          <View style={{ marginTop: 12, gap: 8, width: '100%' }}>
            {matches.map((match) => {
              const recipe = recipeById.get(match.id);
              if (!recipe) return null;
              return (
                <Pressable
                  key={match.id}
                  onPress={() => openRecipe(match.id)}
                  accessibilityRole="button"
                  className="rounded-2xl border px-4 py-3 active:opacity-80"
                  style={{
                    borderColor: colors.border,
                    backgroundColor: colors.background,
                    alignSelf: 'stretch',
                  }}
                >
                  <Text className="text-base font-semibold" style={{ color: colors.text }}>
                    {recipe.display_title ?? recipe.title}
                  </Text>
                  {match.reason ? (
                    <Text className="mt-1 text-sm leading-5" style={{ color: colors.textSecondary }}>
                      {match.reason}
                    </Text>
                  ) : null}
                  {match.missing.length > 0 ? (
                    <Text className="mt-1 text-xs" style={{ color: colors.warning }}>
                      {t('library.fridgeMatchMissing', { items: match.missing.join(', ') })}
                    </Text>
                  ) : null}
                </Pressable>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SheetModal>
  );
}
