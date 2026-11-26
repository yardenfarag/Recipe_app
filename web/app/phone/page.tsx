import type { Metadata } from "next";

import { PhonePage } from "@/components/pantry/PhonePage";

export const metadata: Metadata = { title: "Send photos to Pinch" };

/**
 * Where the QR code from "Use your phone's camera" lands: /app/phone#<token> (PIN-181). Open to everyone, without
 * the app shell: a phone that isn't signed in only ever sends photos to the computer that made the code.
 */
export default function Page() {
  return <PhonePage />;
}
