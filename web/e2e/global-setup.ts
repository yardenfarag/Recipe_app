import { createUser } from "./admin";
import { TEST_USER } from "./testUser";

/** Creates the test account in local Supabase (once; it stays between runs). */
export default async function globalSetup() {
  try {
    await createUser(TEST_USER.email, TEST_USER.password);
  } catch (error) {
    // Already there from an earlier run.
    if (!/(422)|already|exists|registered/i.test(String(error))) throw error;
  }
}
