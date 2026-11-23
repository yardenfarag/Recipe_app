import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nextProvider } from "react-i18next";
import { beforeEach, describe, expect, it, vi } from "vitest";

import type { BatchProgress, RecipeCandidate, RunBatchOptions } from "@shared/lib/whatsappImport";
import { WhatsAppImportError } from "@shared/lib/whatsappImport/types";

import { candidate } from "@/components/whatsapp/testFixtures";
import { WhatsAppImportScreen } from "@/components/whatsapp/WhatsAppImportScreen";
import i18n from "@/lib/i18n";

const mocks = vi.hoisted(() => ({
  readChatExport: vi.fn(),
  findRecipeCandidates: vi.fn(),
  runImportBatch: vi.fn(),
  fetchRecipes: vi.fn(),
  refreshCredits: vi.fn(),
}));

// The shared module's bodies may still be stubs: the screen is tested against its contract.
vi.mock("@shared/lib/whatsappImport", async () => {
  const types = await vi.importActual<typeof import("@shared/lib/whatsappImport/types")>("@shared/lib/whatsappImport/types");
  return {
    ...types,
    MAX_CHAT_FILE_BYTES: 1000,
    IMPORTED_IDS_KEY: "pinch.whatsappImport.importedIds",
    readChatExport: mocks.readChatExport,
    findRecipeCandidates: mocks.findRecipeCandidates,
    runImportBatch: mocks.runImportBatch,
    mergeImportedIds: (previous: string[], added: string[]) => [...new Set([...previous, ...added])],
  };
});
vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: React.ReactNode }) => (
    <a href={href} {...rest}>
      {children}
    </a>
  ),
}));
vi.mock("@/components/AuthProvider", () => ({ useAuth: () => ({ user: { id: "user-1" }, session: null, loading: false }) }));
vi.mock("@/lib/credits/balance", () => ({
  useCreditBalance: () => ({ quota: { totalCredits: 2 }, loading: false, failed: false, refresh: vi.fn() }),
  refreshCredits: mocks.refreshCredits,
}));
vi.mock("@/lib/supabase", () => ({ getSupabase: vi.fn() }));
vi.mock("@shared/lib/supabase/recipes", () => ({ fetchRecipes: mocks.fetchRecipes }));

const FOUND: RecipeCandidate[] = [
  candidate("1"),
  candidate("2"),
  candidate("3", { likelyRecipe: false, preview: "maybe" }),
  candidate("4", { alreadySaved: true, preview: "saved before" }),
];

const wrap = () => render(<I18nextProvider i18n={i18n}>{<WhatsAppImportScreen />}</I18nextProvider>);

async function chooseFile(name = "WhatsApp Chat with Family.zip", size = 10) {
  const file = new File([new Uint8Array(size)], name, { type: "application/zip" });
  fireEvent.change(screen.getByTestId("whatsapp-file-input"), { target: { files: [file] } });
}

/** A batch that reports as the test says, and finishes when told to. */
function controlledBatch() {
  let report: ((progress: BatchProgress) => void) | undefined;
  let finish: ((progress: BatchProgress) => void) | undefined;
  let signal: AbortSignal | undefined;
  mocks.runImportBatch.mockImplementationOnce((_items: RecipeCandidate[], _importOne: unknown, options: RunBatchOptions) => {
    report = options.onProgress;
    signal = options.signal;
    return new Promise<BatchProgress>((resolve) => {
      finish = resolve;
    });
  });
  return {
    report: (progress: BatchProgress) => act(() => report?.(progress)),
    finish: (progress: BatchProgress) => act(async () => finish?.(progress)),
    signal: () => signal,
  };
}

const progress = (patch: Partial<BatchProgress>): BatchProgress => ({
  total: 2,
  done: 0,
  saved: 0,
  alreadySaved: 0,
  failed: 0,
  stoppedForCredits: false,
  cancelled: false,
  items: { 1: "waiting", 2: "waiting" },
  recipeIds: {},
  ...patch,
});

describe("WhatsAppImportScreen", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    window.localStorage.clear();
    await i18n.changeLanguage("en");
    mocks.readChatExport.mockReturnValue({ messages: [], photoNames: [], readPhoto: () => null });
    mocks.findRecipeCandidates.mockReturnValue(FOUND);
    mocks.fetchRecipes.mockResolvedValue([{ id: "r1", original_url: "https://youtu.be/x" }, { id: "r2" }]);
  });

  it("explains how to export a chat, and that it is read here", () => {
    wrap();
    expect(screen.getByRole("heading", { level: 1, name: "Import from a WhatsApp chat" })).toBeDefined();
    expect(screen.getByText(/iPhone: open the chat/)).toBeDefined();
    expect(screen.getByText(/send the file to yourself/)).toBeDefined();
    expect(screen.getByText(/Pinch reads the chat on your device/)).toBeDefined();
  });

  it("reads the chat and ticks the likely recipes, marking the Library's links", async () => {
    window.localStorage.setItem("pinch.whatsappImport.importedIds", JSON.stringify(["old"]));
    wrap();
    await chooseFile();
    await screen.findByRole("heading", { name: "Found 4 possible recipes" });
    expect(mocks.readChatExport).toHaveBeenCalledWith({ name: "WhatsApp Chat with Family.zip", bytes: expect.any(Uint8Array) });
    expect(mocks.findRecipeCandidates).toHaveBeenCalledWith(expect.anything(), { savedSourceUrls: ["https://youtu.be/x"], importedIds: ["old"] });
    const ticked = screen.getAllByRole("checkbox").filter((box) => box.getAttribute("aria-checked") === "true");
    expect(ticked).toHaveLength(2);
    // Two ticked, two credits: no warning.
    expect(screen.getAllByText("2 credits").length).toBeGreaterThan(0);
    expect(screen.queryByText(/more recipes than you have credits/)).toBeNull();
    fireEvent.click(screen.getByRole("checkbox", { name: /maybe/ }));
    expect(screen.getAllByText(/more recipes than you have credits/).length).toBeGreaterThan(0);
  });

  it.each([
    ["not_a_chat", "That doesn’t look like a WhatsApp chat. Choose the .txt or .zip file WhatsApp made."],
    ["empty", "Couldn’t find any recipes in this chat."],
  ] as const)("says what is wrong with the file (%s)", async (code, message) => {
    mocks.readChatExport.mockImplementation(() => {
      throw new WhatsAppImportError(code);
    });
    wrap();
    await chooseFile();
    expect((await screen.findByRole("alert")).textContent).toBe(message);
  });

  it("turns away a file too big to read, without reading it", async () => {
    wrap();
    await chooseFile("chat.zip", 2000);
    expect((await screen.findByRole("alert")).textContent).toBe("That file is too big. Export the chat again without media.");
    expect(mocks.readChatExport).not.toHaveBeenCalled();
  });

  it("says so when a chat has nothing that looks like a recipe", async () => {
    mocks.findRecipeCandidates.mockReturnValue([]);
    wrap();
    await chooseFile();
    expect((await screen.findByRole("alert")).textContent).toBe("Couldn’t find any recipes in this chat.");
  });

  it("imports the ticked items, shows the progress, and remembers what was imported", async () => {
    const batch = controlledBatch();
    wrap();
    await chooseFile();
    await screen.findByRole("heading", { name: "Found 4 possible recipes" });
    fireEvent.click(screen.getAllByRole("button", { name: "Import 2 recipes" })[0]);

    expect(mocks.runImportBatch).toHaveBeenCalledWith([FOUND[0], FOUND[1]], expect.any(Function), expect.objectContaining({ concurrency: 2 }));
    expect(screen.getByRole("heading", { name: "Importing 0 of 2…" })).toBeDefined();
    batch.report(progress({ done: 1, saved: 1, items: { 1: "saved", 2: "working" }, recipeIds: { 1: "recipe-1" } }));
    expect(screen.getByRole("heading", { name: "Importing 1 of 2…" })).toBeDefined();

    await batch.finish(progress({ done: 2, saved: 1, failed: 1, items: { 1: "saved", 2: "failed" }, recipeIds: { 1: "recipe-1" } }));
    expect(screen.getByRole("heading", { name: "All done" })).toBeDefined();
    expect(screen.getByText("1 recipe saved to your Library")).toBeDefined();
    expect(JSON.parse(window.localStorage.getItem("pinch.whatsappImport.importedIds") ?? "[]")).toEqual(["1"]);
    expect(mocks.refreshCredits).toHaveBeenCalled();

    // Trying again sends only the failed one.
    controlledBatch();
    fireEvent.click(screen.getByRole("button", { name: "Try the failed ones again" }));
    expect(mocks.runImportBatch).toHaveBeenLastCalledWith([FOUND[1]], expect.any(Function), expect.anything());
  });

  it("Stop aborts the batch, and the rest go back on the list", async () => {
    const batch = controlledBatch();
    wrap();
    await chooseFile();
    await screen.findByRole("heading", { name: "Found 4 possible recipes" });
    fireEvent.click(screen.getAllByRole("button", { name: "Import 2 recipes" })[0]);
    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    expect(batch.signal()?.aborted).toBe(true);

    await batch.finish(progress({ done: 1, saved: 1, cancelled: true, items: { 1: "saved", 2: "waiting" }, recipeIds: { 1: "recipe-1" } }));
    expect(screen.getByText("Stopped. The rest are still on the list.")).toBeDefined();
    fireEvent.click(screen.getByRole("button", { name: "Back" }));

    await waitFor(() => expect(screen.getByRole("checkbox", { name: /tiktok.com 1/ })).toBeDefined());
    // The imported one is now in the Library; the one that never ran is still ticked.
    expect((screen.getByRole("checkbox", { name: /tiktok.com 1/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByRole("checkbox", { name: /tiktok.com 2/ }).getAttribute("aria-checked")).toBe("true");
    expect(screen.getAllByRole("button", { name: "Import 1 recipe" }).length).toBeGreaterThan(0);
  });
});
