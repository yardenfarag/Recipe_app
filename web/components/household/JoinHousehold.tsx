"use client";

import { Clock, Link2Off, ListChecks, LogIn, TriangleAlert, UserPlus, Users } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslation } from "react-i18next";

import { acceptHouseholdInvite, previewHouseholdInvite } from "@shared/lib/supabase/household";
import { showToast } from "@shared/lib/toast";
import { HOUSEHOLD_DISPLAY_NAME_MAX, HOUSEHOLD_MAX_MEMBERS, type InvitePreview } from "@shared/types/household";

import { useAuth } from "@/components/AuthProvider";
import { AvatarStack, HouseholdAvatar, MemberAvatar } from "@/components/household/HouseholdAvatar";
import { useSuggestedDisplayName } from "@/components/household/SetupHousehold";
import { useSignInHere } from "@/components/shell/OpenShell";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button, buttonClasses } from "@/components/ui/Button";
import { usePageTitle } from "@/components/ui/PageHeader";
import { ErrorState, LoadingState } from "@/components/ui/States";
import { TextField } from "@/components/ui/TextField";
import { Tile, tileClasses } from "@/components/ui/Tile";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { householdErrorText } from "@/lib/household/householdText";

type PreviewState = { status: "loading" } | { status: "failed" } | { status: "ready"; preview: InvitePreview };

/** What the invite link leads to, read again when the visitor signs in (the answer depends on who asks). */
function useInvitePreview(token: string) {
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const [state, setState] = useState<PreviewState>({ status: "loading" });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;
    // Loads from the network, so state is set after the response.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setState({ status: "loading" });
    previewHouseholdInvite(token)
      .then((preview) => !cancelled && setState({ status: "ready", preview }))
      .catch(() => !cancelled && setState({ status: "failed" }));
    return () => {
      cancelled = true;
    };
  }, [token, userId, authLoading, attempt]);

  return { state, retry: useCallback(() => setAttempt((n) => n + 1), []) };
}

/**
 * /join/<token> (ADR 034): the page an invite link opens. Anyone can see whose household it is (its name and
 * picture, who invited them, how many people); only someone signed in can join, since the list is only for the
 * people in it. A guest signs up or in and comes back with `?join=1`, and joining carries on by itself, unless it
 * means leaving a household with other people, which they confirm here first.
 */
export function JoinHousehold({ token }: { token: string }) {
  const { t } = useTranslation();
  const { state, retry } = useInvitePreview(token);
  usePageTitle(state.status === "ready" && state.preview.householdName ? t("household.join.title", { name: state.preview.householdName }) : t("household.join.pageTitle"));

  if (state.status === "loading") return <LoadingState />;
  if (state.status === "failed") {
    return <ErrorState title={t("household.join.loadError")} trackId="household.join.load_error" onRetry={retry} />;
  }

  const { preview } = state;
  const name = preview.householdName;
  switch (preview.status) {
    case "not_found":
      return <Problem icon={<Link2Off aria-hidden />} title={t("household.join.notFoundTitle")} body={t("household.join.notFoundBody")} />;
    case "expired":
      return <Problem icon={<Clock aria-hidden />} title={t("household.join.expiredTitle")} body={t("household.join.expiredBody")} />;
    case "full":
      return <Problem icon={<Users aria-hidden />} title={t("household.join.fullTitle")} body={t("household.join.fullBody", { count: HOUSEHOLD_MAX_MEMBERS })} />;
    case "already_member":
      return (
        <Problem
          icon={<HouseholdAvatar value={preview.householdAvatar} className="h-16 w-16" />}
          title={t("household.join.alreadyMemberTitle", { name })}
          action={
            <Link href="/list" data-track="household.join.open_list" className={buttonClasses({ variant: "primary" })}>
              <ListChecks aria-hidden className="h-5 w-5" />
              {t("household.join.openList")}
            </Link>
          }
        />
      );
    default:
      return <Invitation token={token} preview={preview} />;
  }
}

/** An invite that can't be used: says why, plainly, in the look of the kit's EmptyState. Its heading is the page's h1. */
function Problem({ icon, title, body, action }: { icon: ReactNode; title: string; body?: string; action?: ReactNode }) {
  return (
    <Tile className="mx-auto mt-4 flex w-full max-w-lg flex-col items-center px-6 py-14 text-center">
      <span className="mb-5 grid h-16 w-16 place-items-center rounded-[20px] bg-primary-soft text-primary-text [&>svg]:h-8 [&>svg]:w-8">{icon}</span>
      <h1 className="text-xl font-bold text-balance text-text">{title}</h1>
      {body ? <p className="mt-2 max-w-sm text-[15px] leading-relaxed text-pretty text-muted">{body}</p> : null}
      {action ? <div className="mt-6">{action}</div> : null}
    </Tile>
  );
}

function Invitation({ token, preview }: { token: string; preview: InvitePreview }) {
  const { t } = useTranslation();
  const router = useRouter();
  const params = useSearchParams();
  const { user } = useAuth();
  const { apply } = useHousehold();
  const signInHere = useSignInHere();
  const suggested = useSuggestedDisplayName();
  const [displayName, setDisplayName] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);
  const autoJoined = useRef(false);
  const name = preview.householdName;
  const value = displayName ?? suggested;

  const join = useCallback(
    async (chosenName: string) => {
      if (!chosenName.trim()) {
        setNameError(t("household.setup.yourNameRequired"));
        nameRef.current?.focus();
        return;
      }
      setBusy(true);
      setFailure(null);
      try {
        const joined = await acceptHouseholdInvite(token, chosenName.trim());
        apply(joined);
        showToast(t("household.join.joined", { name: joined.name ?? name }));
        // Like a saved shared recipe: the list replaces this page, so Back doesn't return to the link.
        router.replace("/list");
      } catch (caught) {
        setFailure(householdErrorText(caught, t, "household.join.failed"));
        setBusy(false);
      }
    },
    [apply, name, router, t, token],
  );

  // Back from signing up or in with ?join=1: join straight away, unless it means leaving people behind (that is
  // confirmed here) or there is no name to suggest (they type one).
  const wantsJoin = params.get("join") === "1";
  useEffect(() => {
    if (!wantsJoin || !user || autoJoined.current) return;
    autoJoined.current = true;
    const url = new URL(window.location.href);
    url.searchParams.delete("join");
    window.history.replaceState(window.history.state, "", url);
    // Starting the join the visitor asked for before signing in is what this effect is for.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (!preview.leaving && suggested) void join(suggested);
    else nameRef.current?.focus();
  }, [join, preview.leaving, suggested, user, wantsJoin]);

  const people = preview.members.length > 0 ? preview.members : [];

  return (
    <div className="mx-auto flex w-full max-w-xl flex-col gap-4 py-2 sm:py-6">
      <Tile className="flex flex-col items-center px-5 py-8 text-center sm:px-10">
        <HouseholdAvatar value={preview.householdAvatar} className="h-28 w-28 sm:h-32 sm:w-32" />
        <h1 className="mt-5 text-[28px] leading-tight font-bold text-balance text-text sm:text-[34px]">
          {t("household.join.title", { name })}
        </h1>
        {preview.invitedBy ? (
          <p className="mt-3 flex items-center gap-2 text-[15px] text-text">
            <MemberAvatar name={preview.invitedBy.displayName} avatarUrl={preview.invitedBy.avatarUrl} className="h-7 w-7 text-[28px]" />
            <span>{t("household.join.invitedBy", { name: preview.invitedBy.displayName })}</span>
          </p>
        ) : null}
        <p className="mt-3 flex items-center gap-2.5 text-sm text-muted">
          {people.length > 0 ? <AvatarStack people={people} size="sm" max={5} /> : <Users aria-hidden className="h-4 w-4" />}
          <span>{t("household.join.members", { count: preview.memberCount })}</span>
        </p>
        <p className="mt-5 max-w-md text-[15px] leading-relaxed text-pretty text-muted">{t("household.join.whatHappens")}</p>
      </Tile>

      {user ? (
        <form
          onSubmit={(event: FormEvent) => {
            event.preventDefault();
            void join(value);
          }}
          noValidate
          className={tileClasses({ className: "flex flex-col gap-4 p-5 sm:p-6" })}
        >
          <TextField
            ref={nameRef}
            label={t("household.join.yourNameLabel")}
            hint={t("household.join.yourNameHint")}
            value={value}
            maxLength={HOUSEHOLD_DISPLAY_NAME_MAX}
            autoComplete="given-name"
            error={nameError ?? undefined}
            disabled={busy}
            onChange={(event) => {
              setDisplayName(event.target.value);
              setNameError(null);
            }}
          />
          {preview.leaving ? (
            <p role="note" className="flex items-start gap-2.5 rounded-2xl bg-warning-soft px-4 py-3 text-sm leading-relaxed text-text">
              <TriangleAlert aria-hidden className="mt-0.5 h-4 w-4 shrink-0 text-warning" />
              <span>{t("household.join.leaveWarning", { name: preview.leaving.name })}</span>
            </p>
          ) : null}
          {failure ? <ErrorAlert>{failure}</ErrorAlert> : null}
          <Button type="submit" size="lg" fullWidth busy={busy} trackId={preview.leaving ? "household.join.leave_and_join" : "household.join.join"}>
            {busy ? t("household.join.joining") : preview.leaving ? t("household.join.leaveAndJoin") : t("household.join.join")}
          </Button>
        </form>
      ) : (
        <Tile className="flex flex-col gap-4 p-5 sm:p-6">
          <p className="text-[15px] leading-relaxed text-pretty text-text">{t("household.join.signedOut")}</p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <Link
              href={`${signInHere("signup", "join=1")}&reason=join_household`}
              data-track="household.join.sign_up"
              className={buttonClasses({ size: "lg", className: "w-full sm:w-auto sm:flex-1" })}
            >
              <UserPlus aria-hidden className="h-5 w-5" />
              {t("household.join.signUp")}
            </Link>
            <Link
              href={`${signInHere("signin", "join=1")}&reason=join_household`}
              data-track="household.join.sign_in"
              className={buttonClasses({ variant: "outline", size: "lg", className: "w-full sm:w-auto sm:flex-1" })}
            >
              <LogIn aria-hidden className="h-5 w-5 rtl:rotate-180" />
              {t("household.join.signIn")}
            </Link>
          </div>
        </Tile>
      )}
    </div>
  );
}
