import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'pinch:guest-migration-journal';

type MigrationJournal = {
  idMap: Record<string, string>;
};

type StoredJournals = Record<string, MigrationJournal>;

let mutationQueue: Promise<void> = Promise.resolve();

export async function prepareGuestRecipeIdMap(
  userId: string,
  guestRecipeIds: string[],
): Promise<Record<string, string>> {
  return serializeMutation(async () => {
    const journals = await readJournals();
    const journal = journals[userId] ?? { idMap: {} };
    let changed = journals[userId] === undefined;

    for (const guestId of guestRecipeIds) {
      if (!journal.idMap[guestId]) {
        journal.idMap[guestId] = createUuid();
        changed = true;
      }
    }

    if (changed) {
      journals[userId] = journal;
      await writeJournals(journals);
    }
    return { ...journal.idMap };
  });
}

export async function updateGuestRecipeIdMapping(
  userId: string,
  guestId: string,
  cloudId: string,
): Promise<void> {
  return serializeMutation(async () => {
    const journals = await readJournals();
    const journal = journals[userId] ?? { idMap: {} };
    journal.idMap[guestId] = cloudId;
    journals[userId] = journal;
    await writeJournals(journals);
  });
}

export async function clearGuestMigrationJournal(userId: string): Promise<void> {
  return serializeMutation(async () => {
    const journals = await readJournals();
    if (!(userId in journals)) return;
    delete journals[userId];
    await writeJournals(journals);
  });
}

async function readJournals(): Promise<StoredJournals> {
  const raw = await AsyncStorage.getItem(STORAGE_KEY);
  if (!raw) return {};
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return parsed as StoredJournals;
  } catch {
    return {};
  }
}

function writeJournals(journals: StoredJournals): Promise<void> {
  return AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(journals));
}

function serializeMutation<T>(mutation: () => Promise<T>): Promise<T> {
  const result = mutationQueue.then(mutation, mutation);
  mutationQueue = result.then(
    () => undefined,
    () => undefined,
  );
  return result;
}

function createUuid(): string {
  if (globalThis.crypto?.randomUUID) return globalThis.crypto.randomUUID();
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (token) => {
    const random = Math.floor(Math.random() * 16);
    const value = token === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}
