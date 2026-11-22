"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";

import { completeOAuthFromCallbackUrl } from "@shared/lib/supabase/auth";

import { AuthCard, PinchMark } from "@/components/AuthCard";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { takeRememberedNextPath } from "@/lib/nextPath";
import { getSupabase } from "@/lib/supabase";

/** Google sends people back here with a one-time code. Swap it for a session, then go where they were headed. */
export default function AuthCallbackPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  // The code works once. React runs effects twice in development, so guard against a second exchange.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    getSupabase();
    const url = window.location.href;
    const finish = /[?#&](code|access_token|error)=/.test(url)
      ? completeOAuthFromCallbackUrl(url)
      : Promise.reject(new Error(t("auth.callbackMissing")));
    finish
      .then(() => router.replace(takeRememberedNextPath()))
      .catch((err) => setError(err instanceof Error ? err.message : t("auth.callbackFailed")));
  }, [router, t]);

  return (
    <AuthCard>
      <PinchMark />
      {error ? (
        <div className="flex flex-col gap-4">
          <ErrorAlert>{error}</ErrorAlert>
          <Button fullWidth size="lg" trackId="auth_callback.back_to_sign_in" onClick={() => router.replace("/auth?mode=signin")}>{t("auth.backToSignIn")}</Button>
        </div>
      ) : (
        <div className="flex justify-center py-6">
          <Spinner label={t("auth.callbackFinishing")} />
        </div>
      )}
    </AuthCard>
  );
}
