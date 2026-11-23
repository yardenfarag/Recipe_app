import type { RecipeCandidate } from "@shared/lib/whatsappImport";

/** A candidate for tests: a TikTok link from Savta unless the patch says otherwise. */
export function candidate(id: string, patch: Partial<RecipeCandidate> = {}): RecipeCandidate {
  return {
    id,
    kind: "link",
    sender: "Savta",
    sentAt: "2024-05-12T18:22:00.000Z",
    url: `https://www.tiktok.com/@cook/video/${id}`,
    platform: "tiktok",
    preview: `tiktok.com ${id}`,
    likelyRecipe: true,
    alreadySaved: false,
    ...patch,
  };
}
