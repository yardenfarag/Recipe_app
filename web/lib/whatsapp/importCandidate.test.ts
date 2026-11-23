import { beforeEach, describe, expect, it, vi } from "vitest";

import { candidate } from "@/components/whatsapp/testFixtures";
import { createChatImporter } from "@/lib/whatsapp/importCandidate";

const mocks = vi.hoisted(() => ({
  extractRecipe: vi.fn(),
  extractRecipeFromImage: vi.fn(),
  extractRecipeFromText: vi.fn(),
  applyKitchen: vi.fn(),
  saveDraft: vi.fn(),
  compress: vi.fn(),
  acknowledge: vi.fn(),
  requestId: vi.fn(async (key: string) => `id-for-${key}`),
}));

vi.mock("@shared/lib/supabase/extractRecipe", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@shared/lib/supabase/extractRecipe")>()),
  extractRecipe: mocks.extractRecipe,
  extractRecipeFromImage: mocks.extractRecipeFromImage,
  extractRecipeFromText: mocks.extractRecipeFromText,
}));
vi.mock("@shared/lib/supabase/kitchenAutoApply", () => ({ applyKitchenOnExtract: mocks.applyKitchen }));
vi.mock("@shared/lib/supabase/saveRecipeDraft", () => ({ saveRecipeDraft: mocks.saveDraft }));
vi.mock("@/lib/compressImage", () => ({ compressImageFile: mocks.compress }));
vi.mock("@/lib/analytics", () => ({ captureRecipeExtracted: vi.fn(), captureRecipeSaved: vi.fn() }));
vi.mock("@/lib/snap/requestIds", () => ({
  webExtractionContext: { getOrCreateRequestId: mocks.requestId },
  acknowledgeRequest: mocks.acknowledge,
}));

const RECIPE = { title: "Shakshuka", ingredients: [{ name: "eggs" }], instructions: [{ text: "Cook" }], servings: 2, platform: "tiktok" };
const LINK = candidate("1");
const chat = { readPhoto: vi.fn<(fileName: string) => Uint8Array | null>(() => new Uint8Array([1, 2, 3])) };

/** Calls the import function as the shared code would, with the request-id context, then returns its result. */
function respondWith(result: Record<string, unknown>) {
  const respond = async (context: { getOrCreateRequestId: (key: string) => Promise<string> }, key: string) => {
    const requestId = await context.getOrCreateRequestId(key);
    return { request_id: requestId, ...result };
  };
  mocks.extractRecipe.mockImplementation((context, url: string) => respond(context, url));
  mocks.extractRecipeFromImage.mockImplementation((context, base64: string) => respond(context, `photo:${base64}`));
  mocks.extractRecipeFromText.mockImplementation((context, text: string) => respond(context, `text:${text}`));
}

const importOne = createChatImporter({ chat, userId: "user-1" });

describe("createChatImporter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.applyKitchen.mockImplementation(async (_user: string, recipe: unknown) => ({ recipe, failed: false }));
    mocks.saveDraft.mockResolvedValue({ recipe: { id: "saved-1" }, recoveredDuplicate: false });
    mocks.compress.mockResolvedValue({ base64: "SMALL", mimeType: "image/jpeg" });
  });

  it("imports a link and saves it to the Library, then forgets its request id", async () => {
    respondWith({ status: "full", platform: "tiktok", recipe: RECIPE });
    await expect(importOne(LINK)).resolves.toEqual({ status: "saved", recipeId: "saved-1" });
    expect(mocks.extractRecipe).toHaveBeenCalledWith(expect.anything(), "https://www.tiktok.com/@cook/video/1");
    expect(mocks.applyKitchen).toHaveBeenCalledWith("user-1", RECIPE);
    expect(mocks.saveDraft).toHaveBeenCalledWith(expect.objectContaining({ title: "Shakshuka" }));
    expect(mocks.acknowledge).toHaveBeenCalledWith(LINK.url, `id-for-${LINK.url}`);
  });

  it("keeps the request id when the save fails, so trying again isn't charged twice", async () => {
    respondWith({ status: "full", platform: "tiktok", recipe: RECIPE });
    mocks.saveDraft.mockRejectedValue(new Error("offline"));
    await expect(importOne(LINK)).resolves.toEqual({ status: "failed", code: "save_failed" });
    expect(mocks.acknowledge).not.toHaveBeenCalled();
  });

  it.each(["insufficient_credits", "monthly_limit", "guest_limit"])("%s means out of credits", async (code) => {
    respondWith({ status: "failed", platform: "unknown", code });
    await expect(importOne(LINK)).resolves.toEqual({ status: "out_of_credits" });
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("the day's import limit stops the batch, and says so", async () => {
    respondWith({ status: "failed", platform: "tiktok", code: "daily_limit" });
    const onDailyLimit = vi.fn();
    const limited = createChatImporter({ chat, userId: "user-1", onDailyLimit });
    await expect(limited(LINK)).resolves.toEqual({ status: "out_of_credits" });
    expect(onDailyLimit).toHaveBeenCalledOnce();
  });

  it("a link already in the Library counts as already saved", async () => {
    respondWith({ status: "full", platform: "tiktok", cached: true, recipe: { ...RECIPE, id: "old-1" } });
    await expect(importOne(LINK)).resolves.toEqual({ status: "already_saved", recipeId: "old-1" });
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("anything else is a failure, with its code", async () => {
    respondWith({ status: "failed", platform: "tiktok", code: "no_recipe" });
    await expect(importOne(LINK)).resolves.toEqual({ status: "failed", code: "no_recipe" });
  });

  it("a partial recipe isn't saved as is", async () => {
    respondWith({ status: "partial", platform: "tiktok", recipe: { ...RECIPE, instructions: [] } });
    await expect(importOne(LINK)).resolves.toEqual({ status: "failed", code: "partial" });
    expect(mocks.saveDraft).not.toHaveBeenCalled();
  });

  it("shrinks a photo from the chat before sending it, like Snap", async () => {
    respondWith({ status: "full", platform: "photo", recipe: RECIPE });
    const photo = candidate("p", { kind: "photo", url: undefined, photo: { fileName: "00000012-PHOTO.jpg", mime: "image/jpeg" } });
    await expect(importOne(photo)).resolves.toEqual({ status: "saved", recipeId: "saved-1" });
    expect(chat.readPhoto).toHaveBeenCalledWith("00000012-PHOTO.jpg");
    const file = mocks.compress.mock.calls[0][0] as File;
    expect(file.type).toBe("image/jpeg");
    expect(mocks.extractRecipeFromImage).toHaveBeenCalledWith(expect.anything(), "SMALL", "image/jpeg");
    expect(mocks.acknowledge).toHaveBeenCalledWith("photo:SMALL", "id-for-photo:SMALL");
  });

  it("a photo missing from the export fails without calling the server", async () => {
    chat.readPhoto.mockReturnValueOnce(null);
    const photo = candidate("p", { kind: "photo", url: undefined, photo: { fileName: "gone.jpg", mime: "image/jpeg" } });
    await expect(importOne(photo)).resolves.toEqual({ status: "failed", code: "photo_unreadable" });
    expect(mocks.extractRecipeFromImage).not.toHaveBeenCalled();
  });

  it("sends a written recipe's whole text", async () => {
    respondWith({ status: "full", platform: "unknown", recipe: RECIPE });
    const text = candidate("t", { kind: "text", url: undefined, preview: "Shakshuka", text: "Shakshuka\n4 eggs\nFry them" });
    await expect(importOne(text)).resolves.toEqual({ status: "saved", recipeId: "saved-1" });
    expect(mocks.extractRecipeFromText).toHaveBeenCalledWith(expect.anything(), "Shakshuka\n4 eggs\nFry them");
    expect(mocks.acknowledge).toHaveBeenCalledWith("text:Shakshuka\n4 eggs\nFry them", "id-for-text:Shakshuka\n4 eggs\nFry them");
  });
});
