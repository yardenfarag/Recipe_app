import i18n from "@/lib/i18n";

/**
 * The English for the editor's new `web.editor.*` strings, for unit tests. Added without overwriting, so the tests
 * pass before and after the strings reach shared/i18n/locales/en.ts.
 */
export const EDITOR_STRINGS_EN = {
  web: {
    editor: {
      "addIngredient": "Add ingredient",
      "addStep": "Add step",
      "addAppliance": "Add appliance",
      "ingredientsHint": "Enter adds the next line. Paste a list to add several at once.",
      "stepsHint": "Enter starts the next step, Shift+Enter a new line. Paste several steps at once.",
      "reorderHint": "Drag to reorder, or press Alt with ↑ or ↓.",
      "moveItem": "Move {{item}}",
      "moved": "{{item}} moved to position {{position}} of {{total}}.",
      "ingredientN": "Ingredient {{n}}",
      "photoDrop": "Drop a photo here, paste one, or choose a file.",
      "photoPreparing": "Getting the photo ready…",
      "dropPhoto": "Drop the photo to use it",
      "detailsHint": "Leave these blank and Pinch works them out when you save. Anything you set yourself stays as you set it.",
      "unsaved": "Unsaved changes",
      "noChanges": "No changes yet",
      "saveShortcut": "{{shortcut}} saves",
      "saved": "Recipe saved",
      "savedUpdating": "Saved. Pinch is updating the calories, time and cost.",
      "fixErrors": "Some fields need a fix before you can save.",
      "searchAppliances": "Search appliances",
      "noApplianceMatch": "No appliance matches that.",
      "usedInSteps": "Used in steps",
      "appliancesEmpty": "List what this recipe needs, like an oven or a blender.",
      "appliancesNeedStep": "Add a step first, then the appliances it uses.",
      "tagsHint": "Press Enter or a comma to add a tag."
    },
  },
};

export function addEditorStrings() {
  i18n.addResourceBundle("en", "translation", EDITOR_STRINGS_EN, true, false);
}
