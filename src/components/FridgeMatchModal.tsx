import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { Alert, Platform, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { pickCompressedRecipeImage } from '@/lib/pickCompressedImage';
import { buildFridgeCatalog } from '@shared/lib/fridgeCatalog';
import { getInstallId } from '@/lib/installId';
import { matchFridge, type FridgeMatchRow } from '@shared/lib/supabase/matchFridge';
import type { Recipe } from '@shared/types/recipe';

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
        await getInstallId(),
      );
      if (requestGen.current !== gen) return;
      if (result.code === 'auth_required') {
        handleClose();
        router.push('/auth?mode=signup&reason=sync');
        return;
      }
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

  return (
    <SheetModal
      trackId="fridge_match.sheet" visible={visible} onClose={handleClose} title={t('library.fridgeMatchTitle')}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        style={{ width: '100%', alignSelf: 'stretch' }}
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 14 }}
      >
        <Text variant="bodySmall" tone="muted">
          {t('library.fridgeMatchHint')}
        </Text>

        {libraryEmpty || error === 'empty' ? (
          <View style={{ gap: 12 }}>
            <Text variant="bodySmall" color={colors.warning} accessibilityLiveRegion="polite">
              {t('library.fridgeMatchEmptyLibrary')}
            </Text>
            <Button
              trackId="fridge_match.add_recipes"
              fullWidth
              onPress={() => {
                handleClose();
                router.push('/add');
              }}
            >
              {t('library.snapFirst')}
            </Button>
          </View>
        ) : null}
        {error === 'limited' ? (
          <Text variant="bodySmall" color={colors.warning}>
            {t('library.fridgeMatchLimited')}
          </Text>
        ) : null}
        {error === 'failed' ? (
          <Text variant="bodySmall" color={colors.warning}>
            {t('library.fridgeMatchFailed')}
          </Text>
        ) : null}

        {!libraryEmpty ? (
          <Button
            trackId="fridge_match.snap"
            fullWidth
            size="lg"
            busy={loading}
            icon={Platform.OS === 'web' ? 'images-outline' : 'camera-outline'}
            accessibilityLabel={t('library.fridgeMatchSnap')}
            onPress={handlePick}
          >
            {t('library.fridgeMatchSnap')}
          </Button>
        ) : null}

        {loading ? (
          <Text variant="caption" tone="muted" align="center">
            {t('library.fridgeMatching')}
          </Text>
        ) : null}

        {matches && matches.length === 0 ? (
          <Text variant="bodySmall" tone="muted" accessibilityLiveRegion="polite">
            {t('library.fridgeMatchEmptyResults')}
          </Text>
        ) : null}

        {matches && matches.length > 0 ? (
          <View style={{ gap: 10, width: '100%' }}>
            {matches.map((match) => {
              const recipe = recipeById.get(match.id);
              if (!recipe) return null;
              return (
                <Tile
                  key={match.id}
                  size="md"
                  padding={16}
                  trackId="fridge_match.open_recipe"
                  onPress={() => openRecipe(match.id)}
                  style={{ gap: 4 }}
                >
                  <Text variant="h3">{recipe.display_title ?? recipe.title}</Text>
                  {match.reason ? (
                    <Text variant="bodySmall" tone="muted">
                      {match.reason}
                    </Text>
                  ) : null}
                  {match.missing.length > 0 ? (
                    <Text variant="caption" color={colors.warning}>
                      {t('library.fridgeMatchMissing', { items: match.missing.join(', ') })}
                    </Text>
                  ) : null}
                </Tile>
              );
            })}
          </View>
        ) : null}
      </ScrollView>
    </SheetModal>
  );
}
