"use client";

import { DirectionProvider } from "@radix-ui/react-direction";
import type { ReactNode } from "react";

import { AuthProvider } from "@/components/AuthProvider";
import { LanguageProvider, useLanguage } from "@/components/LanguageProvider";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastHost } from "@/components/ui/Toast";
import { TooltipProvider } from "@/components/ui/Tooltip";
import { textDirection } from "@/lib/i18n";

/** Menus, tooltips and dialogs open on the right side and follow the arrow keys in Hebrew and Arabic too. */
function Direction({ children }: { children: ReactNode }) {
  const { language } = useLanguage();
  return <DirectionProvider dir={textDirection(language)}>{children}</DirectionProvider>;
}

/** What every page shares: the session, the language that follows it, the theme, and the toast host. */
export function Providers({ children }: { children: ReactNode }) {
  return (
    <AuthProvider>
      <LanguageProvider>
        <ThemeProvider>
          <Direction>
            <TooltipProvider>
              {children}
              <ToastHost />
            </TooltipProvider>
          </Direction>
        </ThemeProvider>
      </LanguageProvider>
    </AuthProvider>
  );
}
