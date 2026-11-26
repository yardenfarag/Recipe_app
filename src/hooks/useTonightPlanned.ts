import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';

import { toPlanDate } from '@shared/lib/mealPlan/week';
import { fetchMealPlan } from '@shared/lib/supabase/mealPlan';

import { useAuth } from '@/hooks/useAuth';

/**
 * Tonight's dinner from the meal plan (PIN-77): the recipe planned for today's dinner, not cooked and not leftovers.
 * Read again whenever the Library comes back into view, so a change on the Plan tab shows. Null when nothing is
 * planned (the Library shows Tonight's pick instead).
 */
export function useTonightPlanned(): string | null {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const [found, setFound] = useState<{ userId: string; recipeId: string | null } | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (!userId) return;
      let active = true;
      const today = toPlanDate(new Date());
      fetchMealPlan(today, today)
        .then((rows) => rows.find((row) => row.meal === 'dinner' && !row.leftoverOf && !row.cookedAt)?.recipeId ?? null)
        .catch(() => null)
        .then((recipeId) => {
          if (active) setFound({ userId, recipeId });
        });
      return () => {
        active = false;
      };
    }, [userId]),
  );

  return found && found.userId === userId ? found.recipeId : null;
}
