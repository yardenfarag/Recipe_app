"use client";

import { AccountSettings } from "@/components/settings/AccountSettings";

/**
 * The settings home. On a desktop it opens Account beside the menu; on a phone the layout shows the menu here
 * instead (components/settings/SettingsFrame.tsx).
 */
export default function SettingsPage() {
  return <AccountSettings />;
}
