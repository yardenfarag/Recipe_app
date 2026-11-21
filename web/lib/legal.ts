/** The legal pages live on the main site, whatever address the web app is served from. */
export const LEGAL_BASE_URL = "https://pinch-app.io";

export const SUPPORT_EMAIL = "support@pinch-app.io";

/** The same pages the mobile app opens (src/lib/legal.ts). They are static files in legal/, served at the site root. */
export const LEGAL_URLS = {
  privacy: `${LEGAL_BASE_URL}/privacy.html`,
  terms: `${LEGAL_BASE_URL}/terms.html`,
  deleteAccount: `${LEGAL_BASE_URL}/delete-account.html`,
  deleteData: `${LEGAL_BASE_URL}/delete-data.html`,
  supportMailto: `mailto:${SUPPORT_EMAIL}`,
} as const;
