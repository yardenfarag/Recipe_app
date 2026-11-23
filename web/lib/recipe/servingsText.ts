import type { TFunction } from "i18next";

/** "4 servings", or "1 serving" for one. */
export function servingsText(t: TFunction, count: number): string {
  return t("cookbook.servings", { count });
}
