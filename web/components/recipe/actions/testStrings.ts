import i18n from "@/lib/i18n";

/**
 * Tests only: the English for PIN-135's new `web.recipeActions.*` strings, added under the real ones so the tests read
 * the same words before and after they are merged into shared/i18n/locales (the merged copy wins).
 */
export function addRecipeActionStrings() {
  i18n.addResourceBundle(
    "en",
    "translation",
    {
      web: {
        recipeActions: {
          more: "More",
          swapped: "Swapped {{from}} for {{to}}",
          updated: "Recipe updated",
          reverted: "Back to the original recipe",
          saveFailed: "Couldn’t save the change, so the recipe is as it was. Try again.",
          markedCooked: "Marked as cooked today",
          addNote: "Add a note",
          editNote: "Edit note",
          translateHint: "Translating is free. Each translation is saved with the recipe, so switching back to it is instant.",
          translateFailed: "Couldn’t translate this recipe. Try again.",
          originalBadge: "Original",
          inOtherLanguage: "This recipe is in {{language}}",
          translateTo: "Translate to {{language}}",
          pickStyle: "Or pick a style",
          repairing: "Looking for the missing details…",
        },
      },
    },
    true,
    false,
  );
}
