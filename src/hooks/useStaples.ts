import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { useAuth } from '@/hooks/useAuth';
import { useHousehold } from '@/hooks/useHousehold';
import {
  EMPTY_KITCHEN_PROFILE,
  addPantryStaple,
  loadGuestKitchenProfile,
  removePantryStaple,
  saveGuestKitchenProfile,
  type KitchenProfile,
} from '@/lib/kitchenProfile';
import { isPantryStaple } from '@shared/lib/pantryStaples';

const NO_STAPLES: string[] = [];

/**
 * "Always have": the things a kitchen always has, so lists skip them. A signed-in person's belong to their household
 * (docs/adr/034-households.md), shared with everyone in it; a guest's stay on the device, in the guest kitchen
 * profile, as before.
 */
export function useStaples() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { household, setStaples, staplesError } = useHousehold();
  const signedIn = Boolean(user);

  // Guests: the device's kitchen profile.
  const [guest, setGuest] = useState<KitchenProfile>(EMPTY_KITCHEN_PROFILE);
  const [guestError, setGuestError] = useState(false);
  const guestRef = useRef(guest);
  useEffect(() => {
    if (signedIn) return;
    let active = true;
    void loadGuestKitchenProfile().then((profile) => {
      if (!active) return;
      guestRef.current = profile;
      setGuest(profile);
    });
    return () => {
      active = false;
    };
  }, [signedIn]);

  const saveGuest = useCallback((next: KitchenProfile) => {
    guestRef.current = next;
    setGuest(next);
    setGuestError(false);
    void saveGuestKitchenProfile(next).catch(() => setGuestError(true));
  }, []);

  const householdStaples = household?.staples;
  const staples = useMemo(
    () => (signedIn ? (householdStaples ?? NO_STAPLES) : guest.pantryStaples),
    [guest.pantryStaples, householdStaples, signedIn],
  );
  const staplesRef = useRef(staples);
  staplesRef.current = staples;

  const keepStaple = useCallback(
    (name: string) => {
      if (signedIn) {
        const next = addPantryStaple({ ...EMPTY_KITCHEN_PROFILE, pantryStaples: staplesRef.current }, name);
        if (next.pantryStaples !== staplesRef.current) setStaples(next.pantryStaples);
      } else {
        saveGuest(addPantryStaple(guestRef.current, name));
      }
    },
    [saveGuest, setStaples, signedIn],
  );

  const dropStaple = useCallback(
    (name: string) => {
      if (signedIn) {
        const next = removePantryStaple({ ...EMPTY_KITCHEN_PROFILE, pantryStaples: staplesRef.current }, name);
        if (next.pantryStaples.length !== staplesRef.current.length) setStaples(next.pantryStaples);
      } else {
        saveGuest(removePantryStaple(guestRef.current, name));
      }
    },
    [saveGuest, setStaples, signedIn],
  );

  const stapleSaved = useCallback((name: string) => isPantryStaple(name, staples), [staples]);

  const failed = signedIn ? staplesError : guestError;
  return {
    staples,
    keepStaple,
    dropStaple,
    stapleSaved,
    error: failed ? t('settings.kitchenSaveFailed') : null,
  };
}
