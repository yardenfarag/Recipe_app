import i18n from "@/lib/i18n";

/**
 * Tests only: the English for PIN-155's new `myAppliances.*` strings, added under the real ones so the tests read the
 * same words before and after they are merged into shared/i18n/locales (the merged copy wins).
 */
export function addMyAppliancesStrings() {
  i18n.addResourceBundle(
    "en",
    "translation",
    {
      myAppliances: {
        "title": "My appliances",
        "hint": "Tick what's in your kitchen. When a recipe needs something you don't have, Pinch tells you and can change the steps to work without it.",
        "notSet": "Not set up yet, so recipes don't check your kitchen. Tick what you have to start.",
        "noneOfThese": "I have none of these",
        "checking_one": "Recipes check your kitchen · {{count}} appliance ticked",
        "checking_other": "Recipes check your kitchen · {{count}} appliances ticked",
        "stopChecking": "Stop checking",
        "clearTitle": "Stop checking your kitchen?",
        "clearBody": "Your list is cleared, and recipes stop saying what you're missing. You can tick your appliances again anytime.",
        "clearConfirm": "Clear my list",
        "basicsHint": "Most kitchens have these, so they start ticked. Untick any you don't have.",
        "inKitchen": "In your kitchen",
        "notInKitchen": "Not in your kitchen",
        "haveEverything": "You have everything",
        "missingTitle": "Not in your kitchen",
        "missingFix_one": "Pinch can change the steps so you can make it without it.",
        "missingFix_other": "Pinch can change the steps so you can make it without them.",
        "missingNoFix_one": "Save the recipe, and Pinch can change the steps so you can make it without it.",
        "missingNoFix_other": "Save the recipe, and Pinch can change the steps so you can make it without them.",
        "editLink": "Edit my appliances",
        "standInWorks": "{{alternative}} works too",
        "askLink": "Tell Pinch what's in your kitchen, and recipes will say what you're missing",
      },
      // The same shape as shared/i18n/locales: one dotted key at the top, not "groups" inside myAppliances. A nested
      // copy here once hid that the screens couldn't reach the real one.
      "myAppliances.groups": {
        "heat": "Grill, fry & toast",
        "slow_pressure": "Slow & pressure cookers",
        "blend_mix": "Blend & mix",
        "tools": "Tools & pans",
        "specialist": "Special machines",
        "basics": "Basics"
      },
    },
    true,
    false,
  );
}
