import { normalizeShoppingName } from '@/lib/shoppingListMerge';

/** True when `hay` tokens appear as a consecutive phrase in `needle`. */
function containsPhrase(needle: string, hay: string): boolean {
  const needleTokens = needle.split(' ');
  const hayTokens = hay.split(' ');
  if (hayTokens.length === 0 || hayTokens.length > needleTokens.length) return false;
  for (let i = 0; i <= needleTokens.length - hayTokens.length; i++) {
    let matched = true;
    for (let j = 0; j < hayTokens.length; j++) {
      if (needleTokens[i + j] !== hayTokens[j]) {
        matched = false;
        break;
      }
    }
    if (matched) return true;
  }
  return false;
}

/** True when this ingredient should stay off the shopping list. */
export function isPantryStaple(name: string, staples: string[]): boolean {
  const needle = normalizeShoppingName(name);
  if (!needle) return false;
  for (const staple of staples) {
    const hay = normalizeShoppingName(staple);
    if (!hay) continue;
    if (needle === hay || containsPhrase(needle, hay)) return true;
  }
  return false;
}

export function filterPantryStaples<T extends { name: string }>(
  items: T[],
  staples: string[],
): { kept: T[]; skipped: T[] } {
  const kept: T[] = [];
  const skipped: T[] = [];
  for (const item of items) {
    if (isPantryStaple(item.name, staples)) skipped.push(item);
    else kept.push(item);
  }
  return { kept, skipped };
}
