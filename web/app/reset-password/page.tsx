"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { getPasswordStrength, validatePassword } from "@shared/lib/authValidation";
import { consumePasswordRecoveryUrl, hasSession, updatePassword } from "@shared/lib/supabase/auth";

import { AuthCard, PinchMark } from "@/components/AuthCard";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Spinner } from "@/components/ui/Spinner";
import { usePageTitle } from "@/components/ui/PageHeader";
import { TextField } from "@/components/ui/TextField";
import { getSupabase } from "@/lib/supabase";
import { authErrorText } from "@shared/lib/serverErrors";

type Stage = "checking" | "ready" | "invalid" | "done";

function passwordProblemKey(password: string): string | null {
  const problem = validatePassword(password);
  if (!problem) return null;
  if (problem === "Use at least 8 characters.") return "auth.passwordMin";
  if (problem === "Include at least one letter.") return "auth.passwordLetter";
  return "auth.passwordNumber";
}

/**
 * Choose a new password. Reached two ways: the link in the reset email (it carries a one-time code), or
 * /reset-password?via=code after typing the 6-digit code on the sign-in page, which already signed in.
 */
export default function ResetPasswordPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const [stage, setStage] = useState<Stage>("checking");
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  usePageTitle(t("resetPassword.chooseTitle"));
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    getSupabase();
    const url = window.location.href;
    const viaCode = new URL(url).searchParams.get("via") === "code";

    const check = viaCode || !/[?#&](code|token_hash|access_token)=/.test(url)
      ? hasSession().then((signedIn) => {
          if (!signedIn) throw new Error(t("resetPassword.openLink"));
        })
      : consumePasswordRecoveryUrl(url);

    check
      .then(() => {
        setStage("ready");
        // Keep the one-time code out of the history and out of any shared screenshot.
        window.history.replaceState(null, "", "/app/reset-password");
      })
      .catch((err) => {
        setStage("invalid");
        setError(authErrorText(err, t, "resetPassword.invalidLink"));
      });
  }, [t]);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    const problem = passwordProblemKey(password);
    if (problem) return setError(t(problem));
    if (password !== confirmation) return setError(t("resetPassword.mismatch"));
    setError(null);
    setBusy(true);
    try {
      await updatePassword(password);
      setStage("done");
    } catch (err) {
      setError(authErrorText(err, t, "resetPassword.updateFailed"));
    } finally {
      setBusy(false);
    }
  }

  if (stage === "checking") {
    return (
      <AuthCard>
        <PinchMark />
        <div className="flex justify-center py-6">
          <Spinner />
        </div>
      </AuthCard>
    );
  }

  if (stage === "done") {
    return (
      <AuthCard>
        <PinchMark />
        {/* Announced when it appears, without taking the heading role away from the title. */}
        <div role="status">
          <h1 className="mb-2 text-center text-2xl font-bold text-text">{t("resetPassword.updatedTitle")}</h1>
          <p className="mb-6 text-center text-muted">{t("resetPassword.updatedBody")}</p>
        </div>
        <Button fullWidth size="lg" trackId="reset_password.done.continue" onClick={() => router.replace("/")}>{t("recipe.goToLibrary")}</Button>
      </AuthCard>
    );
  }

  if (stage === "invalid") {
    return (
      <AuthCard>
        <PinchMark />
        <div className="flex flex-col gap-4">
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          <Button fullWidth size="lg" trackId="reset_password.request_new_link" onClick={() => router.replace("/auth?mode=forgot")}>{t("resetPassword.requestNewLink")}</Button>
        </div>
      </AuthCard>
    );
  }

  return (
    <AuthCard>
      <PinchMark />
      <h1 className="mb-2 text-center text-2xl font-bold text-text">{t("resetPassword.chooseTitle")}</h1>
      <p className="mb-6 text-center text-muted">{t("resetPassword.chooseHint")}</p>
      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <TextField
          label={t("resetPassword.newPassword")}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          hint={password ? t(`auth.strength.${getPasswordStrength(password)}`) : undefined}
          dir="ltr"
          autoFocus
          trailing={
            <button
              type="button"
              data-track="reset_password.password.toggle_visibility"
              className="rounded-full px-3 py-1 text-sm font-semibold text-primary hover:bg-primary-soft"
              onClick={() => setShowPassword((value) => !value)}
              aria-pressed={showPassword}
            >
              {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
            </button>
          }
        />
        <TextField
          label={t("resetPassword.confirmPassword")}
          type={showPassword ? "text" : "password"}
          autoComplete="new-password"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          dir="ltr"
        />
        {error ? <ErrorAlert>{error}</ErrorAlert> : null}
        <Button fullWidth size="lg" type="submit" trackId="reset_password.submit" busy={busy}>
          {t("resetPassword.update")}
        </Button>
      </form>
    </AuthCard>
  );
}
