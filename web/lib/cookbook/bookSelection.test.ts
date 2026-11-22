import { describe, expect, it, vi } from "vitest";

import { addAllToBook, clearDraft, moveInBook, readDraft, removeFromBook, toggleInBook, writeDraft } from "@/lib/cookbook/bookSelection";

describe("book order", () => {
  it("adds at the end and takes out again", () => {
    expect(toggleInBook(["a", "b"], "c")).toEqual(["a", "b", "c"]);
    expect(toggleInBook(["a", "b", "c"], "b")).toEqual(["a", "c"]);
  });

  it("adds a whole collection after what is there, without doubles", () => {
    expect(addAllToBook(["b"], ["a", "b", "c", "a"])).toEqual(["b", "a", "c"]);
  });

  it("removes several", () => {
    expect(removeFromBook(["a", "b", "c"], ["a", "c"])).toEqual(["b"]);
  });

  it("moves one place, or across the list", () => {
    expect(moveInBook(["a", "b", "c"], 2, 1)).toEqual(["a", "c", "b"]);
    expect(moveInBook(["a", "b", "c", "d"], 0, 3)).toEqual(["b", "c", "d", "a"]);
    expect(moveInBook(["a", "b", "c", "d"], 3, 0)).toEqual(["d", "a", "b", "c"]);
  });

  it("ignores moves off either end", () => {
    const ids = ["a", "b"];
    expect(moveInBook(ids, 0, -1)).toBe(ids);
    expect(moveInBook(ids, 1, 2)).toBe(ids);
    expect(moveInBook(ids, 1, 1)).toBe(ids);
  });
});

describe("draft", () => {
  it("remembers the book for this tab", () => {
    const store = new Map<string, string>();
    const storage = { getItem: (key: string) => store.get(key) ?? null, setItem: (key: string, value: string) => void store.set(key, value), removeItem: (key: string) => void store.delete(key) };
    writeDraft({ title: "Family", ids: ["a", "b"], pageSize: "letter", includePhotos: false }, storage);
    expect(readDraft(storage)).toEqual({ title: "Family", ids: ["a", "b"], pageSize: "letter", includePhotos: false });
    clearDraft(storage);
    expect(readDraft(storage)).toBeNull();
  });

  it("keeps the default title as null, and survives junk or blocked storage", () => {
    expect(readDraft({ getItem: () => JSON.stringify({ ids: ["a", 3], title: 7, pageSize: "a5" }) })).toEqual({
      title: null,
      ids: ["a"],
      pageSize: "a4",
      includePhotos: true,
    });
    expect(readDraft({ getItem: () => "{not json" })).toBeNull();
    expect(
      readDraft({
        getItem: () => {
          throw new Error("blocked");
        },
      }),
    ).toBeNull();
    const setItem = vi.fn(() => {
      throw new Error("full");
    });
    expect(() => writeDraft({ title: null, ids: [], pageSize: "a4", includePhotos: true }, { setItem })).not.toThrow();
  });
});
