import { useFocusEffect } from '@react-navigation/native';
import { useCallback, useState } from 'react';

import { useAuth } from '@/hooks/useAuth';
import { getGuestRecipes } from '@/lib/guestRecipes';
import { fetchRecipes } from '@/lib/supabase/recipes';
import { Recipe } from '@/types/recipe';

/**
 * Loads the current user's recipes — guest (AsyncStorage) or Supabase,
 * depending on auth state — and refreshes whenever the screen regains
 * focus (e.g. after saving a recipe or signing in/out).
 */
export function useRecipes() {
  const { user } = useAuth();
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = user ? await fetchRecipes() : await getGuestRecipes();
      setRecipes(data);
    } catch {
      setRecipes([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      refresh();
    }, [refresh]),
  );

  return { recipes, loading, refresh };
}
