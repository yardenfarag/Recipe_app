import type { Metadata } from "next";

import { WelcomeScreen } from "@/components/onboarding/WelcomeScreen";

export const metadata: Metadata = { title: "Welcome · Pinch" };

/**
 * The front door for a first-time visitor (PIN-140). Drawn in full at build time, so it paints before the app's
 * scripts have loaded (PIN-174); the address bar's `next` is read in the browser.
 */
export default function WelcomePage() {
  return <WelcomeScreen />;
}
