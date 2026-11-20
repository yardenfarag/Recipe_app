import { freeExtractsRemaining } from "@shared/lib/quotas";

import { t } from "@/lib/i18n";

// Placeholder that proves the path from commit to live page (PIN-127), and that the web app reads the
// mobile app's strings and logic from shared/ (PIN-128). Screens replace it from PIN-130 on.
export default function Home() {
  return (
    <main className="flex flex-1 items-center justify-center p-6">
      <div className="w-full max-w-md rounded-3xl border border-border bg-surface p-8 text-center shadow-sm">
        <h1 className="text-3xl font-semibold text-primary">Pinch</h1>
        <p className="mt-3 text-lg text-text">{t("onboarding.welcomeTitle")}</p>
        <p className="mt-2 text-muted">{t("settings.creditsMonthlyNote", { limit: freeExtractsRemaining(0) })}</p>
        <p className="mt-6 text-sm text-muted">The new web app is on its way.</p>
      </div>
    </main>
  );
}
