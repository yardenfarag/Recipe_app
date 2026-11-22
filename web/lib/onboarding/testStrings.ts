import i18n from "@/lib/i18n";

/**
 * The English for the new `web.welcome.*`, `web.onboarding.*` and `web.firstRecipe.*` strings (PIN-140), for unit
 * tests. Added without overwriting, so the tests pass before and after the strings reach shared/i18n/locales/en.ts.
 */
export const ONBOARDING_STRINGS_EN = {
  web: {
    welcome: {
      tabTitle: "Welcome",
      eyebrow: "Free to start. No card needed.",
      title: "Save any recipe in seconds. Cook it tonight.",
      body: "Paste a link from TikTok, Instagram, YouTube or any recipe site, or snap a cookbook page. Pinch writes out the ingredients and steps, so you stop pausing videos and start cooking.",
      getStarted: "Get started free",
      haveAccount: "I already have an account",
      signupReason: "Create your free account. Then three quick questions, so every recipe fits your kitchen.",
      benefitsTitle: "Why cooks use Pinch",
      timeTitle: "Seconds, not screenshots",
      timeBody: "No more pausing and rewinding. Get the whole recipe from a video in one go.",
      moneyTitle: "Buy only what you need",
      moneyBody: "Send the ingredients to your shopping list, and leave off what’s already in your pantry.",
      easeTitle: "Made for your kitchen",
      easeBody: "Scale servings, switch cups to grams, and adapt any recipe to your diet or allergies.",
      sampleTitle: "Creamy tomato pasta",
      sampleMeta: "25 min · 4 servings",
      sampleListed: "Ingredients added to your list"
    },
    onboarding: {
      tabTitle: "Set up your kitchen",
      railBody: "Three quick questions, so every recipe you save fits the way you cook. It takes about 30 seconds.",
      stepDiet: "How you cook",
      stepAvoid: "Allergies and dislikes",
      stepHeard: "How you found Pinch",
      skipForNow: "Skip for now",
      loadFailed: "We couldn’t load your kitchen settings. Try again, or skip this for now and set them later in Settings."
    },
    firstRecipe: {
      title: "Save your first recipe",
      body: "Bring in a recipe you’ve been meaning to cook. It takes seconds, and then it’s yours to scale, shop for and cook from.",
      linkTitle: "Paste a link",
      linkBody: "From TikTok, Instagram, YouTube or any recipe site.",
      photoTitle: "Snap a photo",
      photoBody: "A cookbook page, a handwritten card or a screenshot.",
      hubTitle: "Pick one from the Hub",
      hubBody: "Save a recipe other cooks already brought in, for free."
    }
  }
};

export function addOnboardingStrings() {
  i18n.addResourceBundle("en", "translation", ONBOARDING_STRINGS_EN, true, false);
}
