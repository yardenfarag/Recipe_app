import type { ReactNode } from "react";

import { SettingsFrame } from "@/components/settings/SettingsFrame";

/** The settings menu and the page it opens: side by side on a desktop, one after the other on a phone. */
export default function SettingsLayout({ children }: { children: ReactNode }) {
  return <SettingsFrame>{children}</SettingsFrame>;
}
