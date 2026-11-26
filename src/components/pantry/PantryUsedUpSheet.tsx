import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { CheckRow } from '@/components/pantry/PantryParts';
import { SheetModal } from '@/components/SheetModal';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { HAIRLINE } from '@/components/ui/tokens';
import { setPantryCache } from '@/hooks/usePantry';
import { useThemePreference } from '@/hooks/useThemePreference';
import { pantryItemsUsedBy } from '@shared/lib/pantry';
import { deletePantryItems, fetchPantryItems } from '@shared/lib/supabase/pantry';
import { showToast } from '@shared/lib/toast';
import type { PantryItem } from '@shared/types/pantry';
import type { Recipe } from '@shared/types/recipe';

/** Long enough for the sheet before it (the cooked note) to finish closing; iOS can't present two at once. */
const AFTER_OTHER_SHEET_MS = 450;

type PantryUsedUpOfferProps = {
  /** Goes up by one each time the recipe is marked cooked; 0 means not yet. */
  trigger: number;
  /** The recipe's ingredients (as saved and as shown, so both languages match). */
  ingredients: Recipe['ingredients'];
  /** Another sheet is open (cook mode, the cooked note): wait for it. */
  blocked: boolean;
  userId: string;
};

/**
 * After "I cooked this" (PIN-181): when the recipe probably used things from the pantry, a small sheet lists them,
 * none ticked, to take out the ones that ran out. Says nothing when the pantry has none of them (or can't be read).
 */
export function PantryUsedUpOffer({ trigger, ingredients, blocked, userId }: PantryUsedUpOfferProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const [items, setItems] = useState<PantryItem[] | null>(null);
  const [ready, setReady] = useState(false);
  const [ticked, setTicked] = useState<Set<string>>(() => new Set());
  const [removing, setRemoving] = useState(false);
  const ingredientsRef = useRef(ingredients);
  ingredientsRef.current = ingredients;

  useEffect(() => {
    if (trigger === 0) return;
    let active = true;
    void fetchPantryItems()
      .then((pantry) => {
        if (!active) return;
        setPantryCache(userId, pantry);
        const used = pantryItemsUsedBy({ ingredients: ingredientsRef.current }, pantry);
        if (used.length === 0) return;
        setTicked(new Set());
        setItems(used);
      })
      .catch(() => {
        // The pantry is a nice-to-have here: no sheet.
      });
    return () => {
      active = false;
    };
  }, [trigger, userId]);

  useEffect(() => {
    if (!items || blocked) {
      setReady(false);
      return;
    }
    const timer = setTimeout(() => setReady(true), AFTER_OTHER_SHEET_MS);
    return () => clearTimeout(timer);
  }, [items, blocked]);

  function close() {
    setItems(null);
    setReady(false);
  }

  async function remove() {
    if (removing || ticked.size === 0) return;
    setRemoving(true);
    const ids = [...ticked];
    try {
      await deletePantryItems(ids);
      showToast(t('pantry.usedUp.removed', { count: ids.length }));
      void fetchPantryItems()
        .then((pantry) => setPantryCache(userId, pantry))
        .catch(() => {});
      close();
    } catch {
      showToast(t('pantry.saveFailed'), 'error');
    } finally {
      setRemoving(false);
    }
  }

  function toggle(id: string) {
    setTicked((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <SheetModal
      trackId="pantry_used_up.sheet"
      visible={Boolean(items) && ready && !blocked}
      onClose={close}
      title={t('pantry.usedUp.title')}
      footer={
        <View style={{ gap: 8, paddingHorizontal: 20, paddingVertical: 14, borderTopWidth: HAIRLINE, borderColor: colors.border }}>
          <Button
            trackId="pantry_used_up.remove"
            fullWidth
            disabled={ticked.size === 0}
            busy={removing}
            onPress={() => void remove()}
          >
            {t('pantry.usedUp.remove', { count: ticked.size })}
          </Button>
          <Button trackId="pantry_used_up.skip" variant="ghost" fullWidth onPress={close}>
            {t('pantry.usedUp.skip')}
          </Button>
        </View>
      }
    >
      <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingBottom: 16, gap: 12 }}>
        <Text variant="bodySmall" tone="muted">
          {t('pantry.usedUp.body')}
        </Text>
        <View>
          {(items ?? []).map((item, index) => (
            <CheckRow
              key={item.id}
              trackId="pantry_used_up.toggle"
              first={index === 0}
              checked={ticked.has(item.id)}
              onToggle={() => toggle(item.id)}
              label={item.name}
              detail={[t(`pantry.places.${item.place}`), item.brand].filter(Boolean).join(' · ')}
            />
          ))}
        </View>
      </ScrollView>
    </SheetModal>
  );
}
