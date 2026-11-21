import type { TFunction } from "i18next";

import { appShareUrl, shareAppInBrowser } from "@shared/lib/shareApp";
import { showToast } from "@shared/lib/toast";

import { LEGAL_BASE_URL } from "@/lib/legal";

/** "Share Pinch": the browser's share sheet, or the link copied, with the same text as the mobile app. */
export async function shareApp(t: TFunction): Promise<void> {
  try {
    const outcome = await shareAppInBrowser({
      title: t("settings.shareAppTitle"),
      message: t("settings.shareAppMessage"),
      url: appShareUrl(LEGAL_BASE_URL, "web"),
    });
    if (outcome === "copied") showToast(t("settings.shareAppCopied"));
  } catch {
    showToast(t("settings.shareAppFailedTitle"), "info");
  }
}
