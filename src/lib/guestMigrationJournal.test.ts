import { beforeEach, describe, expect, it, vi } from 'vitest';

const storage = vi.hoisted(() => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: vi.fn(async (key: string) => values.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
  };
});

vi.mock('@react-native-async-storage/async-storage', () => ({ default: storage }));

describe('guest migration journal', () => {
  beforeEach(() => {
    storage.values.clear();
    vi.clearAllMocks();
    vi.resetModules();
  });

  it('restores the same guest-to-cloud ids after a failed run and restart', async () => {
    const firstRun = await import('./guestMigrationJournal');
    const firstMap = await firstRun.prepareGuestRecipeIdMap('user-1', [
      'guest-recipe-1',
      'guest-recipe-2',
    ]);

    vi.resetModules();
    const retry = await import('./guestMigrationJournal');
    const retryMap = await retry.prepareGuestRecipeIdMap('user-1', [
      'guest-recipe-1',
      'guest-recipe-2',
    ]);

    expect(retryMap).toEqual(firstMap);
    expect(firstMap['guest-recipe-1']).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
  });

  it('keeps journals isolated by destination user', async () => {
    const journal = await import('./guestMigrationJournal');
    const firstUser = await journal.prepareGuestRecipeIdMap('user-1', ['guest-recipe-1']);
    const secondUser = await journal.prepareGuestRecipeIdMap('user-2', ['guest-recipe-1']);

    expect(secondUser['guest-recipe-1']).not.toBe(firstUser['guest-recipe-1']);
  });
});
