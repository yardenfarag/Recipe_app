import { Apple, Package, Refrigerator, Snowflake, type LucideIcon } from "lucide-react";
import type { TFunction } from "i18next";

import { daysSince } from "@shared/lib/pantry";
import type { PantryPlace } from "@shared/types/pantry";

export const PLACE_ICONS: Record<PantryPlace, LucideIcon> = {
  fridge: Refrigerator,
  freezer: Snowflake,
  cupboard: Package,
  other: Apple,
};

/** "today", "yesterday", "3 days ago", for "Scanned …". */
export function whenText(iso: string | null | undefined, t: TFunction): string | null {
  const days = daysSince(iso);
  if (days === null) return null;
  if (days === 0) return t("pantry.today");
  if (days === 1) return t("pantry.yesterday");
  return t("pantry.daysAgo", { count: days });
}
