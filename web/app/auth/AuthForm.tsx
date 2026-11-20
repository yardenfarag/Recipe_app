"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { getPasswordStrength, isValidEmail, normalizeEmail, validatePassword } from "@shared/lib/authValidation";
import {
  sendSignInCode,
  signInWithEmail,
  signUpWithEmail,
  verifyResetCode,
  verifySignInCode,
  type AuthError,
} from "@shared/lib/supabase/auth";

import { AuthCard, PinchMark } from "@/components/AuthCard";
import { useAuth } from "@/components/AuthProvider";
import { ErrorAlert, Notice } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { TextField } from "@/components/ui/TextField";
import { requestPasswordReset, signInWithGoogle } from "@/lib/auth";
import i18n from "@/lib/i18n";
import { LEGAL_URLS } from "@/lib/legal";
import { safeNextPath } from "@/lib/nextPath";
import { getSupabase } from "@/lib/supabase";

/** 'code' signs in with a 6-digit emailed code instead of a password. */
export type Mode = "signin" | "signup" | "forgot" | "code";
type WaitingFor = "confirm" | "reset" | "code" | null;

const CODE_LENGTH = 6;

/** Why sign-in was opened, from ?reason=. Changes the line under the title. */
const REASON_SUBTITLES = {
  extract_limit: "auth.reasonExtract",
  save_limit: "auth.reasonSave",
  sync: "auth.reasonSync",
  shared_recipe: "auth.reasonShared",
  hub_recipe: "auth.reasonHub",
  edit: "auth.reasonEdit",
} as const;

export function parseMode(value: string | null): Mode {
  return value === "signin" || value === "forgot" || value === "code" ? value : "signup";
}

function passwordProblem(password: string): string | null {
  const problem = validatePassword(password);
  if (!problem) return null;
  if (problem === "Use at least 8 characters.") return "auth.passwordMin";
  if (problem === "Include at least one letter.") return "auth.passwordLetter";
  return "auth.passwordNumber";
}

export function AuthForm() {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { user, loading: authLoading } = useAuth();
  const next = safeNextPath(params.get("next"));
  const reason = params.get("reason");

  const [mode, setMode] = useState<Mode>(() => parseMode(params.get("mode")));
  const [waitingFor, setWaitingFor] = useState<WaitingFor>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [code, setCode] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Signed in (here, in another tab, or already when the page opened): go where the visitor was headed.
  // A reset code signs in too, but that flow continues to /reset-password instead.
  useEffect(() => {
    if (!authLoading && user && waitingFor !== "reset") router.replace(next);
  }, [authLoading, user, waitingFor, next, router]);

  // Make sure the client exists before the first call; it is created in the browser only.
  useEffect(() => {
    getSupabase();
  }, []);

  const usesPassword = mode === "signin" || mode === "signup";
  const language = i18n.language;

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    setWaitingFor(null);
    setPassword("");
    setShowPassword(false);
    setCode("");
    setNotice(null);
    setError(null);
  }

  function show(err: unknown, fallbackKey: string) {
    setError(err instanceof Error ? err.message : t(fallbackKey));
  }

  async function sendCodeEmail(target: "code" | "reset", address: string) {
    if (target === "code") await sendSignInCode(address, language);
    else await requestPasswordReset(address);
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const address = normalizeEmail(email);
    if (!isValidEmail(address)) return setError(t("auth.validEmail"));
    if (usesPassword && !password) return setError(t("auth.enterPassword"));
    if (mode === "signup") {
      const problem = passwordProblem(password);
      if (problem) return setError(t(problem));
    }

    setBusy(true);
    try {
      if (mode === "signup") {
        const { needsConfirmation } = await signUpWithEmail(address, password, language);
        if (needsConfirmation) {
          setPassword("");
          setWaitingFor("confirm");
        }
      } else if (mode === "signin") {
        await signInWithEmail(address, password);
      } else {
        const target = mode === "code" ? "code" : "reset";
        await sendCodeEmail(target, address);
        setCode("");
        setNotice(null);
        setWaitingFor(target);
      }
    } catch (err) {
      show(err, "auth.genericError");
    } finally {
      setBusy(false);
    }
  }

  async function handleVerifyCode(value = code) {
    const digits = value.replace(/\D/g, "");
    if (digits.length !== CODE_LENGTH || busy) return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      if (waitingFor === "reset") {
        await verifyResetCode(normalizeEmail(email), digits);
        router.replace("/reset-password?via=code");
        return;
      }
      await verifySignInCode(normalizeEmail(email), digits);
    } catch (err) {
      setError((err as AuthError | null)?.code === "otp_expired" ? t("auth.codeInvalid") : errorText(err));
    } finally {
      setBusy(false);
    }
  }

  function errorText(err: unknown) {
    return err instanceof Error ? err.message : t("auth.genericError");
  }

  async function handleResendCode() {
    if (waitingFor !== "code" && waitingFor !== "reset") return;
    setError(null);
    setNotice(null);
    setBusy(true);
    try {
      await sendCodeEmail(waitingFor, normalizeEmail(email));
      setCode("");
      setNotice(t("auth.codeResent"));
    } catch (err) {
      show(err, "auth.genericError");
    } finally {
      setBusy(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setBusy(true);
    try {
      await signInWithGoogle(next);
    } catch (err) {
      show(err, "auth.googleFailed");
      setBusy(false);
    }
  }

  if (waitingFor === "code" || waitingFor === "reset") {
    const isReset = waitingFor === "reset";
    const codeComplete = code.length === CODE_LENGTH;
    return (
      <AuthCard>
        <PinchMark />
        <h1 className="mb-2 text-center text-2xl font-bold text-text">{t("auth.checkEmail")}</h1>
        <p className="text-center text-muted">{t(isReset ? "auth.resetSent" : "auth.codeSent")}</p>
        <p className="mb-6 text-center font-semibold text-text" dir="ltr">
          {normalizeEmail(email)}
        </p>
        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            void handleVerifyCode();
          }}
        >
          <TextField
            label={t("auth.codeLabel")}
            hint={t(isReset ? "auth.resetInstructions" : "auth.codeInstructions")}
            value={code}
            invalid={Boolean(error)}
            onChange={(event) => {
              const digits = event.target.value.replace(/\D/g, "").slice(0, CODE_LENGTH);
              setCode(digits);
              if (error) setError(null);
              // Pasted or autofilled codes sign in right away.
              if (digits.length === CODE_LENGTH) void handleVerifyCode(digits);
            }}
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={CODE_LENGTH}
            autoFocus
            disabled={busy}
            dir="ltr"
            className="text-center text-2xl font-bold tracking-[0.5em]"
          />
          {error ? <ErrorAlert>{error}</ErrorAlert> : null}
          {notice && !error ? <Notice>{notice}</Notice> : null}
          <Button type="submit" disabled={!codeComplete} busy={busy}>
            {t("auth.verifyCode")}
          </Button>
        </form>
        <div className="mt-4 flex flex-col items-center gap-1">
          <Button variant="link" disabled={busy} onClick={() => void handleResendCode()}>
            {t("auth.resendCode")}
          </Button>
          <Button
            variant="link"
            disabled={busy}
            className="text-muted"
            onClick={() => {
              setWaitingFor(null);
              setCode("");
              setNotice(null);
              setError(null);
            }}
          >
            {t("auth.differentEmail")}
          </Button>
        </div>
      </AuthCard>
    );
  }

  if (waitingFor === "confirm") {
    return (
      <AuthCard>
        <PinchMark />
        <h1 className="mb-2 text-center text-2xl font-bold text-text">{t("auth.checkEmail")}</h1>
        <p className="text-center text-muted">{t("auth.confirmSent")}</p>
        <p className="mb-6 text-center font-semibold text-text" dir="ltr">
          {normalizeEmail(email)}
        </p>
        <Button onClick={() => switchMode("signin")}>{t("auth.confirmedSignIn")}</Button>
      </AuthCard>
    );
  }

  const title =
    mode === "signup"
      ? t("auth.createAccount")
      : mode === "forgot"
        ? t("auth.resetPassword")
        : mode === "code"
          ? t("auth.codeTitle")
          : t("auth.welcomeBack");
  const reasonKey = reason && reason in REASON_SUBTITLES ? REASON_SUBTITLES[reason as keyof typeof REASON_SUBTITLES] : null;
  const subtitle = reasonKey
    ? t(reasonKey)
    : t(
        mode === "signup"
          ? "auth.signupSubtitle"
          : mode === "forgot"
            ? "auth.forgotSubtitle"
            : mode === "code"
              ? "auth.codeSubtitle"
              : "auth.signinSubtitle",
      );
  const strength = getPasswordStrength(password);

  return (
    <AuthCard>
      <PinchMark />
      <h1 className="mb-2 text-center text-2xl font-bold text-text">{title}</h1>
      <p className="mb-6 text-center text-muted">{subtitle}</p>

      <form className="flex flex-col gap-4" onSubmit={(event) => void handleSubmit(event)} noValidate>
        <TextField
          label={t("auth.email")}
          type="email"
          name="email"
          autoComplete="email"
          placeholder={t("auth.emailPlaceholder")}
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          dir="ltr"
          required
        />
        {usesPassword ? (
          <TextField
            label={t("auth.password")}
            type={showPassword ? "text" : "password"}
            name="password"
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            hint={
              mode === "signup"
                ? password
                  ? t(`auth.strength.${strength}`)
                  : t("auth.passwordHint")
                : undefined
            }
            dir="ltr"
            required
            trailing={
              <button
                type="button"
                className="rounded-full px-3 py-1 text-sm font-semibold text-primary hover:bg-primary-soft"
                onClick={() => setShowPassword((value) => !value)}
                aria-pressed={showPassword}
              >
                {showPassword ? t("auth.hidePassword") : t("auth.showPassword")}
              </button>
            }
          />
        ) : null}

        {mode === "signin" ? (
          <div className="-mt-2 flex justify-end">
            <Button variant="link" onClick={() => switchMode("forgot")}>
              {t("auth.forgotPassword")}
            </Button>
          </div>
        ) : null}

        {error ? <ErrorAlert>{error}</ErrorAlert> : null}

        <Button type="submit" busy={busy} disabled={!email.trim() || (usesPassword && !password)}>
          {mode === "signup"
            ? t("auth.signUp")
            : mode === "forgot"
              ? t("auth.sendResetLink")
              : mode === "code"
                ? t("auth.sendCode")
                : t("auth.signIn")}
        </Button>
      </form>

      <div className="mt-3 flex flex-col items-center gap-1">
        {usesPassword ? (
          <Button variant="link" onClick={() => switchMode("code")}>
            {t("auth.emailMeCode")}
          </Button>
        ) : null}
        {mode === "code" ? (
          <Button variant="link" onClick={() => switchMode("signin")}>
            {t("auth.usePassword")}
          </Button>
        ) : null}
        <Button variant="link" onClick={() => switchMode(mode === "signup" ? "signin" : "signup")}>
          {mode === "signup" ? t("auth.haveAccount") : t("auth.needAccount")}
        </Button>
      </div>

      {mode !== "forgot" ? (
        <>
          <div className="my-6 flex items-center gap-3 text-sm text-muted">
            <span className="h-px flex-1 bg-border" />
            {t("auth.orContinueWith")}
            <span className="h-px flex-1 bg-border" />
          </div>
          <Button variant="outline" disabled={busy} onClick={() => void handleGoogle()}>
            <GoogleLogo />
            {t("auth.continueGoogle")}
          </Button>
        </>
      ) : (
        <div className="mt-2 flex justify-center">
          <Button variant="link" onClick={() => switchMode("signin")}>
            {t("auth.backToSignIn")}
          </Button>
        </div>
      )}

      <nav aria-label={`${t("auth.privacy")} · ${t("auth.terms")}`} className="mt-8 flex justify-center gap-4 text-sm text-muted">
        <a className="hover:underline" href={LEGAL_URLS.privacy} target="_blank" rel="noopener noreferrer">
          {t("auth.privacy")}
        </a>
        <span aria-hidden>·</span>
        <a className="hover:underline" href={LEGAL_URLS.terms} target="_blank" rel="noopener noreferrer">
          {t("auth.terms")}
        </a>
      </nav>
    </AuthCard>
  );
}

function GoogleLogo() {
  return (
    <svg aria-hidden width="18" height="18" viewBox="0 0 48 48">
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}
