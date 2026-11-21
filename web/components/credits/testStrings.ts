import i18n from "@/lib/i18n";

/**
 * The English for the credits screens' new `web.credits.*` strings, for unit tests. Added without overwriting, so the
 * tests pass before and after the strings reach shared/i18n/locales/en.ts.
 */
export const CREDITS_STRINGS_EN = {
  web: {
    credits: {
      "available": "Credits available",
      "balanceFailed": "Couldn’t load your balance.",
      "freeThisMonth": "Free this month",
      "freeLeft": "{{left}} of {{limit}} left",
      "resetsOn": "Back to {{limit}} on {{date}}",
      "purchased": "Bought",
      "spendOrder": "Free credits are used first, so the ones you buy last longer.",
      "buySubtitle": "One-time payment, no subscription. Credits you buy never expire.",
      "perCredit": "{{price}} per credit",
      "save": "Save {{percent}}",
      "buy": "Buy",
      "buyPackLabel": "Buy {{pack}} for {{price}}",
      "checkoutNote": "You’ll pay on Polar’s secure checkout, then come right back here. Prices are in US dollars.",
      "salesOffTitle": "Buy credits in the Pinch app",
      "salesOffNote": "They’re saved to your account, so you can use them here too.",
      "appStore": "App Store",
      "googlePlay": "Google Play",
      "costsTitle": "What uses credits",
      "costSnap": "Snapping a recipe from a link or photo",
      "costGuess": "Guessing a recipe when there’s no written one",
      "costRepair": "Filling in a recipe’s missing details",
      "costRepairNote": "Only if you keep the result",
      "costOne": "1 credit",
      "freeTitle": "Always free",
      "freeFailed": "Imports that fail or find only part of a recipe",
      "freeRemix": "Remixing a recipe, up to {{limit}} times each",
      "freeSwap": "Swapping an ingredient",
      "freeTranslate": "Translating a recipe",
      "freeWrite": "Writing and editing your own recipes",
      "freeHub": "Saving recipes from the Hub",
      "outTitle": "You’re out of credits",
      "needMoreTitle_one": "This needs {{count}} credit",
      "needMoreTitle_other": "This needs {{count}} credits",
      "outBody": "Buy a pack to keep going, or wait for your {{limit}} free credits on {{date}}.",
      "seeAll": "Credits and prices",
      "contactSupport": "Contact support",
      "menuBuy": "Buy more"
    },
  },
};

export function addCreditsStrings() {
  i18n.addResourceBundle("en", "translation", CREDITS_STRINGS_EN, true, false);
}
