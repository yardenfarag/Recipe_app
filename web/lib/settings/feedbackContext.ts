import type { FeedbackContext } from "@shared/lib/supabase/feedback";

/** The operating system, from the browser's user agent. Good enough to tell support where a report came from. */
export function osFromUserAgent(userAgent: string): string | null {
  if (/iPhone|iPad|iPod/.test(userAgent)) return "iOS";
  if (/Android/.test(userAgent)) return "Android";
  if (/CrOS/.test(userAgent)) return "ChromeOS";
  if (/Windows/.test(userAgent)) return "Windows";
  if (/Mac OS X|Macintosh/.test(userAgent)) return "macOS";
  if (/Linux/.test(userAgent)) return "Linux";
  return null;
}

/** The browser's name, stored where the mobile app stores the phone model. */
export function browserFromUserAgent(userAgent: string): string | null {
  if (/Edg\//.test(userAgent)) return "Edge";
  if (/OPR\//.test(userAgent)) return "Opera";
  if (/Firefox\//.test(userAgent)) return "Firefox";
  if (/Chrome\//.test(userAgent)) return "Chrome";
  if (/Safari\//.test(userAgent)) return "Safari";
  return null;
}

/** Where feedback or a support ticket sent from the web app came from (the mobile app sends its version and phone). */
export function webFeedbackContext(locale: string | null): FeedbackContext {
  const userAgent = typeof navigator === "undefined" ? "" : navigator.userAgent;
  return {
    app_version: null,
    build_number: null,
    platform: "web",
    os_version: osFromUserAgent(userAgent),
    device_model: browserFromUserAgent(userAgent),
    locale: locale?.trim() || null,
  };
}
