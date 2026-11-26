import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * How people find households (docs/adr/034-households.md): a "Shop together" card on the list until dismissed, and
 * a "New" badge on the Household settings row until the screen was opened once. Both are per device.
 */
const PROMO_DISMISSED_KEY = 'pinch:household-promo-dismissed';
const ROW_SEEN_KEY = 'pinch:household-row-seen';

async function readFlag(key: string): Promise<boolean> {
  try {
    return (await AsyncStorage.getItem(key)) === '1';
  } catch {
    // Storage failing should not keep nagging, nor crash: treat it as not set.
    return false;
  }
}

async function writeFlag(key: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, '1');
  } catch {
    // Best effort.
  }
}

export const householdPromoDismissed = () => readFlag(PROMO_DISMISSED_KEY);
export const dismissHouseholdPromo = () => writeFlag(PROMO_DISMISSED_KEY);
export const householdRowSeen = () => readFlag(ROW_SEEN_KEY);
export const markHouseholdRowSeen = () => writeFlag(ROW_SEEN_KEY);
