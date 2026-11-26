"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import type { ReactNode } from "react";

import { ActivityTracker } from "@/components/activity/ActivityTracker";
import { AuthProvider } from "@/components/AuthProvider";
import { InAppMessageHost } from "@/components/inAppMessages/InAppMessageHost";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastHost } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { HouseholdProvider } from "@/lib/household/HouseholdProvider";
import { textDirection } from "@/lib/i18n";

/** Menus, tooltips and dialogs open on the right side and follow the arrow keys in Hebrew and Arabic too. */
function Direction({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  return <DirectionProvider dir={textDirection(language)}>{children}</DirectionProvider>;
}

/**
 * What every page shares: the session, the language that follows it, the theme, the household with its live updates
 * (ADR 034), the toast host, the activity log (ADR 020) and in-app messages (ADR 023).
 */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ThemeProvider>
          <Direction>
            <TooltipProvider>
              <HouseholdProvider>{children}</HouseholdProvider>
              <ToastHost />
              <ActivityTracker />
              <InAppMessageHost />
            </TooltipProvider>
          </Direction>
        </ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
