import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { supabase } from '@/lib/supabase/client';
import {
  createOwnedAppliancesSync,
  type OwnedAppliancesSnapshot,
} from '@shared/lib/supabase/ownedAppliances';

/**
 * "My appliances" (PIN-155) as saved on the signed-in account, shared with the web app. Settings → Recipe
 * preferences edits it; the recipe screen checks a recipe's appliances against it. Signed out it is "not set", so
 * recipes check nothing.
 */
export const ownedAppliances = createOwnedAppliancesSync(supabase);
// Not while the static web export renders in Node: there is no session there.
if (typeof window !== 'undefined') ownedAppliances.start();

// Back in front: pick up a list ticked on the web.
try {
  AppState.addEventListener('change', (state) => {
    if (state === 'active') ownedAppliances.refresh();
  });
} catch {
  // No AppState (static web export): a reload reads the account anyway.
}

export function useOwnedAppliances(): OwnedAppliancesSnapshot {
  return useSyncExternalStore(ownedAppliances.subscribe, ownedAppliances.getSnapshot, ownedAppliances.getSnapshot);
}
