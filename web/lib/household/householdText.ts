import type { TFunction } from "i18next";

import { HOUSEHOLD_MAX_MEMBERS } from "@shared/types/household";
import { HouseholdError } from "@shared/lib/supabase/household";

/** A household call's failure in the app's words; `fallbackKey` for anything without its own message. */
export function householdErrorText(error: unknown, t: TFunction, fallbackKey = "household.saveError"): string {
  const code = error instanceof HouseholdError ? error.code : "unknown";
  switch (code) {
    case "name_required":
      return t("household.setup.nameRequired");
    case "invite_expired":
      return t("household.join.expiredTitle");
    case "invite_not_found":
      return t("household.join.notFoundTitle");
    case "household_full":
      return t("household.invite.full", { count: HOUSEHOLD_MAX_MEMBERS });
    case "already_sent_today":
      return t("household.shopping.alreadySent");
    default:
      return t(fallbackKey);
  }
}

/** "Dana", "Dana and Avi", "Dana, Avi and Noa", in the reader's language. */
export function listNames(names: string[], language: string): string {
  try {
    return new Intl.ListFormat(language, { style: "long", type: "conjunction" }).format(names);
  } catch {
    return names.join(", ");
  }
}

/** A day, written out: "26 Nov" / "26 בנוב׳". */
export function formatDay(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const sameYear = date.getFullYear() === new Date().getFullYear();
  return new Intl.DateTimeFormat(language, { day: "numeric", month: "short", year: sameYear ? undefined : "numeric" }).format(date);
}

/** A day and time, for when a link stops working: "Thu, 3 Dec, 14:05". */
export function formatDayTime(iso: string, language: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(language, { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" }).format(date);
}

/** How long until `when`, rounded up: "in 5 hours", "in 20 minutes", in the reader's language. */
export function formatIn(when: Date, language: string, now: Date = new Date()): string {
  const minutes = Math.max(1, Math.ceil((when.getTime() - now.getTime()) / 60_000));
  const format = new Intl.RelativeTimeFormat(language, { numeric: "always" });
  return minutes < 60 ? format.format(minutes, "minute") : format.format(Math.ceil(minutes / 60), "hour");
}
