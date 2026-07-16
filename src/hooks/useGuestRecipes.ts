import { useCallback, useEffect, useState } from 'react';

import { getGuestRecipes, GUEST_RECIPE_LIMIT } from '@/lib/guestRecipes';
import { Recipe } from '@/types/recipe';

export function useGuestRecipes() {
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    const data = await getGuestRecipes();
    setRecipes(data);
    setLoading(false);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    recipes,
    loading,
    refresh,
    remaining: Math.max(0, GUEST_RECIPE_LIMIT - recipes.length),
    quotaExceeded: recipes.length >= GUEST_RECIPE_LIMIT,
  };
}
