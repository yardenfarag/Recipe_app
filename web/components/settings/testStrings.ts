import i18n from "@/lib/i18n";

/**
 * The English for Settings' new `web.settings.*` strings, for unit tests. Added without overwriting, so the tests
 * pass before and after the strings reach shared/i18n/locales/en.ts.
 */
export const SETTINGS_STRINGS_EN = {
  web: {
    settings: {
      accountHint: "Your email, profile photo, and signing out.",
      helpGroup: "Help & legal",
      languageHint:
        "The language of Pinch’s menus and buttons, and the one recipes are translated into. Hebrew and Arabic read right to left.",
      saving: "Saving…",
      saved: "Saved",
      measurementsDeviceNote: "Saved in this browser. The Pinch app on your phone keeps its own choice.",
      deleteTypeEmail: "To confirm, type your email: {{email}}",
      feedbackBrowserNote: "We’ll include your browser and system so we know where it came from.",
    },
  },
};

export function addSettingsStrings() {
  i18n.addResourceBundle("en", "translation", SETTINGS_STRINGS_EN, true, false);
}
