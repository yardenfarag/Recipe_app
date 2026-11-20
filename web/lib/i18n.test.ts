import { describe, expect, it } from "vitest";

import i18n, { changeLanguage, pickLanguage, textDirection } from "./i18n";

describe("pickLanguage", () => {
  it("uses the account's saved language first", () => {
    expect(pickLanguage("he", "en-US")).toBe("he");
    expect(pickLanguage("es-MX", "en-US")).toBe("es");
    expect(pickLanguage("en", "ru-RU")).toBe("en");
  });

  it("falls back to the browser when the account has none, or one the app doesn't speak", () => {
    expect(pickLanguage(undefined, "ar-EG")).toBe("ar");
    expect(pickLanguage("de", "ru")).toBe("ru");
    expect(pickLanguage(42, "he-IL")).toBe("he");
  });

  it("falls back to English", () => {
    expect(pickLanguage(undefined, "fr-FR")).toBe("en");
    expect(pickLanguage(undefined, undefined)).toBe("en");
  });
});

describe("languages", () => {
  it("reads Hebrew and Arabic right to left", () => {
    expect(textDirection("he")).toBe("rtl");
    expect(textDirection("ar")).toBe("rtl");
    expect(textDirection("es")).toBe("ltr");
  });

  it("loads another language's strings from shared/ on demand", async () => {
    await changeLanguage("he");
    expect(i18n.language).toBe("he");
    expect(i18n.t("auth.signIn")).toBe("כניסה");
    await changeLanguage("en");
    expect(i18n.t("auth.signIn")).toBe("Sign in");
  });
});
