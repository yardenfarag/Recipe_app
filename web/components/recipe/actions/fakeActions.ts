import { vi } from "vitest";

import type { RecipeActions } from "@/components/recipe/actions/RecipeActionsContext";
import type { RecipeDisplay } from "@/components/recipe/types";

/** Tests only: a RecipeActions value with every action a spy, for rendering components inside the context. */
export function fakeActions(display: RecipeDisplay, patch: Partial<RecipeActions> = {}): RecipeActions {
  return {
    display,
    updatingFields: [],
    collections: [],
    adaptation: null,
    canRevert: false,
    canRepair: false,
    canFix: false,
    kitchenSetUp: { avoid: false, appliances: false },
    translateOffer: null,
    busy: { share: false, revert: false, translate: false, repair: false },
    open: vi.fn(),
    share: vi.fn(),
    markCooked: vi.fn(),
    revert: vi.fn(),
    showOriginalLanguage: vi.fn(),
    translateToAppLanguage: vi.fn(),
    ...patch,
  };
}
