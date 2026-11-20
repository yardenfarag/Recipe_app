"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import { freeExtractsRemaining } from "@shared/lib/quotas";

import { useAuth } from "@/components/AuthProvider";
import { Button } from "@/components/ui/Button";
import { signOut } from "@/lib/auth";

// Placeholder home, signed in only. It proves the path from commit to live page (PIN-127), that the web app
// reads the mobile app's strings and logic from shared/ (PIN-128), and sign-in (PIN-129). The Library
// replaces it (PIN-131).
export default function Home() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const router = useRouter();
  const [busy, setBusy] = useState(false);

  async function handleSignOut() {
    setBusy(true);
    try {
      await signOut();
      router.replace("/auth?mode=signin");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-primary">Pinch</h1>
        <p className="mt-3 text-lg text-text">{t("onboarding.welcomeTitle")}</p>
        <p className="mt-2 text-muted">{t("settings.creditsMonthlyNote", { limit: freeExtractsRemaining(0) })}</p>
        {user?.email ? (
          <p className="mt-6 text-sm text-muted" dir="ltr" data-testid="signed-in-email">
            {user.email}
          </p>
        ) : null}
        <Button variant="outline" className="mt-4" busy={busy} onClick={() => void handleSignOut()}>
          {t("settings.signOut")}
        </Button>
      </div>
    </main>
  );
}
