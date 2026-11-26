import AsyncStorage from '@react-native-async-storage/async-storage';
import type { TFunction } from 'i18next';

import { daysSince, foodWords, homeCovers } from '@shared/lib/pantry';
import { isPantryStaple } from '@shared/lib/pantryStaples';
import type { PantryItem } from '@shared/types/pantry';

/**
 * True when an ingredient or list item is already at home: a staple ("salt" keeps "sea salt" off the list) or a
 * pantry item that covers it ("milk" covers "whole milk"). `homeNames` comes from `pantryHomeNames`.
 */
export function makeAtHome(homeNames: string[]): (name: string) => boolean {
  const home = homeNames.map(foodWords).filter((words) => words.length > 0);
  return (name: string) => {
    if (isPantryStaple(name, homeNames)) return true;
    const words = foodWords(name);
    return words.length > 0 && home.some((h) => homeCovers(h, words));
  };
}

/** Like `filterPantryStaples`, against everything at home. */
export function splitAtHome<T extends { name: string }>(
  items: T[],
  homeNames: string[],
): { kept: T[]; skipped: T[] } {
  const atHome = makeAtHome(homeNames);
  const kept: T[] = [];
  const skipped: T[] = [];
  for (const item of items) (atHome(item.name) ? skipped : kept).push(item);
  return { kept, skipped };
}

/** "today", "yesterday", "3 days ago". */
export function pantryWhen(days: number, t: TFunction): string {
  if (days <= 0) return t('pantry.today');
  if (days === 1) return t('pantry.yesterday');
  return t('pantry.daysAgo', { count: days });
}

/** The most recent time any place was scanned, or null when nothing came from a scan. */
export function lastScanAt(items: PantryItem[]): string | null {
  let latest: string | null = null;
  for (const item of items) {
    if (item.source !== 'scan') continue;
    if (!latest || item.lastSeenAt > latest) latest = item.lastSeenAt;
  }
  return latest;
}

/** Whole days since the last scan, or null. */
export function daysSinceLastScan(items: PantryItem[]): number | null {
  return daysSince(lastScanAt(items));
}

/** A v4 UUID for a new scan. Hermes has no `crypto.randomUUID`, so fall back to Math.random (it only names a scan). */
export function newScanId(): string {
  const cryptoObj = globalThis.crypto as { randomUUID?: () => string } | undefined;
  if (cryptoObj?.randomUUID) return cryptoObj.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    return (char === 'x' ? random : (random & 0x3) | 0x8).toString(16);
  });
}

const scanKey = (userId: string) => `pinch:pantry-scan:${userId}`;

/** The scan this person was in the middle of on this device, if any. */
export async function readCurrentScanId(userId: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(scanKey(userId));
  } catch {
    return null;
  }
}

export async function writeCurrentScanId(userId: string, scanId: string | null): Promise<void> {
  try {
    if (scanId) await AsyncStorage.setItem(scanKey(userId), scanId);
    else await AsyncStorage.removeItem(scanKey(userId));
  } catch {
    // Only resuming needs it.
  }
}
