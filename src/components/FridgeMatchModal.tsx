import { router, type Href } from 'expo-router';
import { type ReactNode, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { PantrySignInPrompt } from '@/components/pantry/PantryParts';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { KitIcon, Radii } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useStaples } from '@/hooks/useStaples';
import { useMeasurementPreference } from '@/hooks/useMeasurementPreference';
import { usePantry } from '@/hooks/usePantry';
import { useShoppingList } from '@/hooks/useShoppingList';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useUnitSystemPreference } from '@/hooks/useUnitSystemPreference';
import { daysSinceLastScan, pantryWhen } from '@/lib/pantryHelpers';
import { pickIngredientAmount } from '@shared/lib/ingredientAmounts';
import { PANTRY_STALE_DAYS, pantryHomeNames, rankCookable, type CookableRecipe } from '@shared/lib/pantry';
import { showToast } from '@shared/lib/toast';
import type { Recipe } from '@shared/types/recipe';

type FridgeMatchModalProps = {
  visible: boolean;
  recipes: Recipe[];
  onClose: () => void;
};

/**
 * "What can I cook?" (PIN-181): the Library ranked by what's already in the pantry, fewest missing first, with a
 * button that puts the missing ones on the shopping list. No photo: the pantry is filled from Settings → Pantry.
 * (Old builds still call match-fridge with a photo; this one doesn't.)
 */
export function FridgeMatchModal({ visible, recipes, onClose }: FridgeMatchModalProps) {
  const { t } = useTranslation();
  return (
    <SheetModal trackId="cook_match.sheet" visible={visible} onClose={onClose} title={t('pantry.cook.title')}>
      {/* Mounted only while open, so the pantry and the list are read when asked, not on every Library visit. */}
      {visible ? <CookMatches recipes={recipes} onClose={onClose} /> : null}
    </SheetModal>
  );
}

function CookMatches({ recipes, onClose }: { recipes: Recipe[]; onClose: () => void }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { user } = useAuth();
  const { items, status, reload } = usePantry(true);
  const { staples: pantryStaples } = useStaples();
  const { addFromRecipe } = useShoppingList();
  const { system: measurementSystem } = useMeasurementPreference();
  const { units } = useUnitSystemPreference();
  const [added, setAdded] = useState<Record<string, number>>({});
  const [adding, setAdding] = useState<string | null>(null);

  const ranked = useMemo(
    () => (items.length === 0 ? [] : rankCookable(recipes, pantryHomeNames(items, pantryStaples))),
    [items, pantryStaples, recipes],
  );
  const sinceScan = daysSinceLastScan(items);
  const stale = sinceScan != null && sinceScan >= PANTRY_STALE_DAYS;

  function go(path: Href) {
    onClose();
    router.push(path);
  }

  async function addMissing(match: CookableRecipe) {
    if (adding) return;
    const missing = new Set(match.missing);
    const ingredients = (match.recipe.ingredients ?? [])
      .filter((ing) => missing.has(ing.name))
      .map((ing) => {
        const amount = pickIngredientAmount(ing, measurementSystem, units);
        return { name: ing.name, quantity: amount.quantity, unit: amount.unit };
      });
    if (ingredients.length === 0) return;
    setAdding(match.recipe.id);
    try {
      await addFromRecipe(ingredients, match.recipe.id);
      setAdded((current) => ({ ...current, [match.recipe.id]: ingredients.length }));
      showToast(t('pantry.cook.added', { count: ingredients.length }));
    } catch {
      showToast(t('addToList.failed'), 'error');
    } finally {
      setAdding(null);
    }
  }

  let body: ReactNode;
  if (!user) {
    body = <PantrySignInPrompt onBeforeNavigate={onClose} />;
  } else if (recipes.length === 0) {
    body = (
      <Notice text={t('pantry.cook.emptyLibrary')}>
        <Button trackId="cook_match.add_recipes" fullWidth onPress={() => go('/add')}>
          {t('library.snapFirst')}
        </Button>
      </Notice>
    );
  } else if (status === 'loading' && items.length === 0) {
    body = <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} style={{ paddingVertical: 32 }} />;
  } else if (status === 'failed') {
    body = (
      <Notice text={t('pantry.cook.failed')} tone="danger">
        <Button trackId="cook_match.retry" variant="secondary" icon="refresh" onPress={() => void reload()}>
          {t('common.tryAgainAction')}
        </Button>
      </Notice>
    );
  } else if (items.length === 0) {
    body = (
      <Notice text={t('pantry.cook.emptyPantry')}>
        <Button trackId="cook_match.scan" fullWidth icon="camera-outline" onPress={() => go('/pantry/scan')}>
          {t('pantry.scanKitchen')}
        </Button>
      </Notice>
    );
  } else {
    body = (
      <View style={{ gap: 12 }}>
        {stale && sinceScan != null ? (
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              gap: 10,
              paddingStart: 14,
              paddingEnd: 4,
              borderRadius: Radii.inner,
              backgroundColor: colors.warningSoft,
            }}
          >
            <KitIcon icon="time-outline" size={18} color={colors.warning} />
            <Text variant="caption" color={colors.warning} style={{ flex: 1, minWidth: 0, paddingVertical: 10 }}>
              {t('pantry.cook.stale', { when: pantryWhen(sinceScan, t) })}
            </Text>
            <Button trackId="cook_match.scan_again" variant="link" onPress={() => go('/pantry/scan')}>
              {t('pantry.scanAgain')}
            </Button>
          </View>
        ) : null}
        {ranked.length === 0 ? (
          <Text variant="bodySmall" tone="muted" accessibilityLiveRegion="polite">
            {t('pantry.cook.noMatches')}
          </Text>
        ) : (
          ranked.map((match) => {
            const title = match.recipe.display_title ?? match.recipe.title;
            const addedCount = added[match.recipe.id];
            return (
              <Tile
                key={match.recipe.id}
                size="md"
                padding={16}
                trackId="cook_match.open_recipe"
                accessibilityLabel={title}
                onPress={() => go(`/recipe/${match.recipe.id}`)}
                style={{ gap: 6 }}
              >
                <Text variant="h3">{title}</Text>
                <Text variant="caption" weight="semibold" tone={match.missing.length === 0 ? 'success' : 'primary'}>
                  {match.missing.length === 0
                    ? t('pantry.cook.allThere')
                    : t('pantry.cook.have', { have: match.have, total: match.total })}
                </Text>
                {match.missing.length > 0 ? (
                  <>
                    <Text variant="caption" tone="muted">
                      {t('pantry.cook.missing', { items: match.missing.join(', ') })}
                    </Text>
                    <Button
                      trackId="cook_match.add_missing"
                      variant="secondary"
                      size="sm"
                      icon={addedCount ? 'checkmark' : 'cart-outline'}
                      disabled={Boolean(addedCount)}
                      busy={adding === match.recipe.id}
                      onPress={() => void addMissing(match)}
                      style={{ marginTop: 4 }}
                    >
                      {addedCount ? t('pantry.cook.added', { count: addedCount }) : t('pantry.cook.addMissing')}
                    </Button>
                  </>
                ) : null}
              </Tile>
            );
          })
        )}
      </View>
    );
  }

  return (
    <ScrollView
      keyboardShouldPersistTaps="handled"
      style={{ width: '100%', alignSelf: 'stretch' }}
      contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 24, gap: 14 }}
    >
      {user ? (
        <Text variant="bodySmall" tone="muted">
          {t('pantry.cook.hint')}
        </Text>
      ) : null}
      {body}
    </ScrollView>
  );
}

function Notice({
  text,
  tone = 'muted',
  children,
}: {
  text: string;
  tone?: 'muted' | 'danger';
  children: ReactNode;
}) {
  return (
    <View style={{ gap: 12 }}>
      <Text variant="bodySmall" tone={tone} accessibilityLiveRegion="polite">
        {text}
      </Text>
      {children}
    </View>
  );
}
