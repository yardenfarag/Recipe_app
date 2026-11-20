import { createUser, resetTestUserLanguage } from "./admin";
import { TEST_USER } from "./testUser";

/**
 * Creates the shared test account in local Supabase (once; it stays between runs), and resets it to English.
 * Tests that change the language save it on the account, so without the reset the next run would start in Hebrew.
 */
export default async function globalSetup() {
  try {
    await createUser(TEST_USER.email, TEST_USER.password);
  } catch (error) {
    // Already there from an earlier run.
    if (!/(422)|already|exists|registered/i.test(String(error))) throw error;
  }
  await resetTestUserLanguage();
}
