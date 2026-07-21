/** Product token costs and free allowances (Phase B). */
export const TOKEN_COST_EXTRACT = 10;
export const TOKEN_COST_REMIX = 5;
export const SIGNUP_TOKEN_BONUS = 150;
/** Keep in sync with GUEST_RECIPE_LIMIT — guests shouldn’t extract more than they can save. */
export const GUEST_EXTRACTION_LIMIT = 3;

/** Pack menu (display only until IAP Phase C). */
export const TOKEN_PACKS = [
  { tokens: 100, priceUsd: 1.99, label: '100 tokens' },
  { tokens: 300, priceUsd: 4.99, label: '300 tokens' },
  { tokens: 1000, priceUsd: 12.99, label: '1,000 tokens' },
] as const;

/** Gemini 3.5 Flash list prices used for admin cost tracking. */
export const ADMIN_PRICE_CARD = {
  geminiInputUsdPerM: 1.5,
  geminiOutputUsdPerM: 9.0,
  scrapecreatorsUsdPerCredit: 0.00188,
  extractTokens: TOKEN_COST_EXTRACT,
  remixTokens: TOKEN_COST_REMIX,
  signupBonus: SIGNUP_TOKEN_BONUS,
  guestExtractLimit: GUEST_EXTRACTION_LIMIT,
} as const;
