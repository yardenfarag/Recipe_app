import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/hooks/useAuth';
import {
  EMPTY_KITCHEN_PROFILE,
  addPantryStaple,
  loadGuestKitchenProfile,
  removePantryStaple,
  saveGuestKitchenProfile,
  type KitchenProfile,
} from '@/lib/kitchenProfile';
import { isPantryStaple } from '@/lib/pantryStaples';
import { fetchCloudKitchenProfile, saveCloudKitchenProfile } from '@/lib/supabase/kitchen';

/**
 * Kitchen prefs (diets, swaps, pantry) for the current guest or signed-in user.
 */
export function useKitchenProfile() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [profile, setProfile] = useState<KitchenProfile>(EMPTY_KITCHEN_PROFILE);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<KitchenProfile | null>(null);
  const savingRef = useRef(false);
  const profileRef = useRef(profile);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = user
        ? await fetchCloudKitchenProfile(user.id)
        : await loadGuestKitchenProfile();
      profileRef.current = next;
      setProfile(next);
    } catch {
      profileRef.current = EMPTY_KITCHEN_PROFILE;
      setProfile(EMPTY_KITCHEN_PROFILE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const persist = useCallback(
    async (next: KitchenProfile) => {
      profileRef.current = next;
      setProfile(next);
      pendingRef.current = next;
      if (savingRef.current) return;
      savingRef.current = true;
      setSaving(true);
      setError(null);
      try {
        while (pendingRef.current) {
          const toSave = pendingRef.current;
          pendingRef.current = null;
          if (user) await saveCloudKitchenProfile(user.id, toSave);
          else await saveGuestKitchenProfile(toSave);
        }
      } catch {
        setError(t('settings.kitchenSaveFailed'));
      } finally {
        savingRef.current = false;
        setSaving(false);
      }
      if (pendingRef.current) void persist(pendingRef.current);
    },
    [t, user],
  );

  const keepStaple = useCallback(
    (name: string) => {
      void persist(addPantryStaple(profileRef.current, name));
    },
    [persist],
  );

  const dropStaple = useCallback(
    (name: string) => {
      void persist(removePantryStaple(profileRef.current, name));
    },
    [persist],
  );

  const stapleSaved = useCallback(
    (name: string) => isPantryStaple(name, profile.pantryStaples),
    [profile.pantryStaples],
  );

  return {
    profile,
    loading,
    saving,
    error,
    persist,
    keepStaple,
    dropStaple,
    stapleSaved,
    pantryStaples: profile.pantryStaples,
  };
}
