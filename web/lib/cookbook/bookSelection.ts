import type { CookbookPageSize } from "@shared/lib/cookbook/buildCookbookHtml";

/** Adds the recipe at the end of the book, or takes it out. The order things are picked is the book's order. */
export function toggleInBook(ids: string[], id: string): string[] {
  return ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id];
}

/** Adds the ones not in the book yet, at the end, keeping their order. */
export function addAllToBook(ids: string[], add: string[]): string[] {
  const have = new Set(ids);
  const next = [...ids];
  for (const id of add) {
    if (have.has(id)) continue;
    have.add(id);
    next.push(id);
  }
  return next;
}

export function removeFromBook(ids: string[], remove: string[]): string[] {
  const gone = new Set(remove);
  return ids.filter((id) => !gone.has(id));
}

/** Moves the recipe at `from` to `to`, shifting the ones between. Out-of-range moves change nothing. */
export function moveInBook(ids: string[], from: number, to: number): string[] {
  if (from === to || from < 0 || to < 0 || from >= ids.length || to >= ids.length) return ids;
  const next = [...ids];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved!);
  return next;
}

export type CookbookDraft = {
  /** Null while it is still the default title, so the default follows the app's language. */
  title: string | null;
  ids: string[];
  pageSize: CookbookPageSize;
  includePhotos: boolean;
};

const DRAFT_KEY = "pinch:cookbookDraft";

/**
 * The book being put together, kept for this tab only: a reload or a trip to a recipe and back keeps fifty careful
 * picks. Storage can be blocked or empty; then there is simply no draft.
 */
export function readDraft(storage: Pick<Storage, "getItem"> | null = safeSessionStorage()): CookbookDraft | null {
  try {
    const raw = storage?.getItem(DRAFT_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Partial<CookbookDraft>;
    if (!Array.isArray(value.ids)) return null;
    return {
      title: typeof value.title === "string" ? value.title : null,
      ids: value.ids.filter((id): id is string => typeof id === "string"),
      pageSize: value.pageSize === "letter" ? "letter" : "a4",
      includePhotos: value.includePhotos !== false,
    };
  } catch {
    return null;
  }
}

export function writeDraft(draft: CookbookDraft, storage: Pick<Storage, "setItem"> | null = safeSessionStorage()) {
  try {
    storage?.setItem(DRAFT_KEY, JSON.stringify(draft));
  } catch {
    // Blocked or full: the book still works, it just is not remembered.
  }
}

export function clearDraft(storage: Pick<Storage, "removeItem"> | null = safeSessionStorage()) {
  try {
    storage?.removeItem(DRAFT_KEY);
  } catch {
    // Nothing to do.
  }
}

function safeSessionStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.sessionStorage;
  } catch {
    return null;
  }
}
