"use client";

import { LogOut, Pencil, UserMinus, UserPlus, Users } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, type FormEvent } from "react";
import { useTranslation } from "react-i18next";

import { isHouseholdFull, isShared } from "@shared/lib/household";
import { householdAvatarIdFrom, householdAvatarValue, suggestHouseholdAvatar, type HouseholdAvatarId } from "@shared/lib/householdAvatars";
import { inviteTokenFrom, leaveHousehold, removeHouseholdMember, setMyDisplayName, updateHousehold } from "@shared/lib/supabase/household";
import { showToast } from "@shared/lib/toast";
import { HOUSEHOLD_DISPLAY_NAME_MAX, HOUSEHOLD_MAX_MEMBERS, HOUSEHOLD_NAME_MAX, type Household, type HouseholdMember } from "@shared/types/household";

import { HouseholdAvatar, MemberAvatar } from "@/components/household/HouseholdAvatar";
import { PicturePicker } from "@/components/household/HouseholdFields";
import { InviteDialog } from "@/components/household/InviteDialog";
import { SetupHousehold, WhatYouShare } from "@/components/household/SetupHousehold";
import { SettingsCard } from "@/components/settings/controls";
import { ErrorAlert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog, Dialog, DialogClose, DialogContent } from "@/components/ui/Dialog";
import { IconButton } from "@/components/ui/IconButton";
import { PageHeader } from "@/components/ui/PageHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui/States";
import { TextField } from "@/components/ui/TextField";
import { Tile, TileBadge } from "@/components/ui/Tile";
import { useHousehold } from "@/lib/household/HouseholdProvider";
import { formatDay, householdErrorText } from "@/lib/household/householdText";
import { HOUSEHOLD_SEEN_KEY, useLocalFlag } from "@/lib/household/localFlags";

/**
 * Settings › Household (ADR 034). Not set up: what sharing means and the form to set it up, which goes straight
 * on to inviting people. Set up: the household (name, picture), its people, inviting more, the name the others
 * see, and leaving. Anyone in a household can do all of it. "Have an invite?" takes a pasted link to its page.
 */
export function HouseholdSettings() {
  const { t } = useTranslation();
  const { household, loading, failed, refresh, apply } = useHousehold();
  const [inviteOpen, setInviteOpen] = useState(false);
  const [justCreated, setJustCreated] = useState(false);
  const [, markSeen] = useLocalFlag(HOUSEHOLD_SEEN_KEY);

  // The "New" badge on the menu row has done its job once the page is open.
  useEffect(() => markSeen(), [markSeen]);

  const subtitle =
    household?.isSetUp && isShared(household)
      ? t("household.settingsHintShared", { name: household.name ?? "", count: household.members.length })
      : t("household.settingsHint");

  return (
    <>
      <PageHeader title={t("household.title")} subtitle={subtitle} />
      <div className="flex flex-col gap-4">
        {!household && (loading || !failed) ? (
          <LoadingState />
        ) : !household ? (
          <ErrorState body={t("household.loadError")} trackId="household.load_error" onRetry={() => void refresh()} />
        ) : !household.isSetUp ? (
          <SetupHousehold
            household={household}
            onCreated={(created) => {
              apply(created);
              setJustCreated(true);
              setInviteOpen(true);
            }}
          />
        ) : (
          <SetUp household={household} onInvite={() => setInviteOpen(true)} />
        )}
        {household ? <PasteInvite /> : null}
      </div>
      {household?.isSetUp ? (
        <InviteDialog
          open={inviteOpen}
          onOpenChange={(open) => {
            setInviteOpen(open);
            if (!open) setJustCreated(false);
          }}
          household={household}
          justCreated={justCreated}
        />
      ) : null}
    </>
  );
}

function SetUp({ household, onInvite }: { household: Household; onInvite: () => void }) {
  const [editing, setEditing] = useState(false);
  const shared = isShared(household);
  return (
    <>
      <HouseholdTile household={household} onEdit={() => setEditing(true)} />
      <Members household={household} onInvite={onInvite} />
      <YourName household={household} />
      {shared ? <Leave household={household} /> : null}
      <Tile className="p-5 sm:p-6">
        <WhatYouShare />
      </Tile>
      <EditDialog open={editing} onOpenChange={setEditing} household={household} />
    </>
  );
}

/** The household itself: its picture, name and how many people, with Edit. */
function HouseholdTile({ household, onEdit }: { household: Household; onEdit: () => void }) {
  const { t } = useTranslation();
  return (
    <Tile className="flex items-center gap-4 p-4 sm:gap-5 sm:p-5">
      <HouseholdAvatar value={household.avatar} className="h-16 w-16 sm:h-20 sm:w-20" />
      <div className="min-w-0 flex-1">
        <h2 className="truncate text-2xl font-bold text-text">
          <bdi>{household.name}</bdi>
        </h2>
        <p className="mt-0.5 text-[15px] text-muted">{t("household.join.members", { count: household.members.length })}</p>
      </div>
      <Button variant="outline" size="sm" trackId="household.edit" onClick={onEdit} className="shrink-0">
        <Pencil aria-hidden className="h-4 w-4" />
        {t("household.manage.edit")}
      </Button>
    </Tile>
  );
}

/** Rename the household or change its picture. Saved when Save is pressed; the dialog stays open if it fails. */
function EditDialog({ open, onOpenChange, household }: { open: boolean; onOpenChange: (open: boolean) => void; household: Household }) {
  return <Dialog open={open} onOpenChange={onOpenChange}>{open ? <EditBody household={household} onDone={() => onOpenChange(false)} /> : null}</Dialog>;
}

function EditBody({ household, onDone }: { household: Household; onDone: () => void }) {
  const { t } = useTranslation();
  const { apply } = useHousehold();
  const [name, setName] = useState(household.name ?? "");
  const [picture, setPicture] = useState<HouseholdAvatarId>(householdAvatarIdFrom(household.avatar) ?? suggestHouseholdAvatar(household.id));
  const [error, setError] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!name.trim()) {
      setError(t("household.setup.nameRequired"));
      return;
    }
    setBusy(true);
    setFailure(null);
    try {
      apply(await updateHousehold({ name: name.trim(), avatar: householdAvatarValue(picture) }));
      showToast(t("household.manage.saved"));
      onDone();
    } catch (caught) {
      setFailure(householdErrorText(caught, t));
      setBusy(false);
    }
  }

  return (
    <DialogContent title={t("household.manage.editTitle")} className="max-h-[calc(100dvh-2rem)] overflow-y-auto sm:max-w-lg">
      <form id="household-edit" onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-5">
        <TextField
          label={t("household.setup.nameLabel")}
          value={name}
          maxLength={HOUSEHOLD_NAME_MAX}
          autoComplete="off"
          error={error ?? undefined}
          disabled={busy}
          onChange={(event) => {
            setName(event.target.value);
            setError(null);
          }}
        />
        <PicturePicker label={t("household.setup.avatarLabel")} value={picture} onChange={setPicture} disabled={busy} />
        {failure ? <ErrorAlert>{failure}</ErrorAlert> : null}
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <DialogClose asChild>
            <Button variant="ghost" trackId="household.edit.cancel" disabled={busy}>
              {t("common.cancel")}
            </Button>
          </DialogClose>
          <Button type="submit" busy={busy} trackId="household.edit.save">
            {busy ? t("household.manage.saving") : t("household.manage.save")}
          </Button>
        </div>
      </form>
    </DialogContent>
  );
}

/** Everyone in the household, oldest first, with Remove for the others and Invite for more. */
function Members({ household, onInvite }: { household: Household; onInvite: () => void }) {
  const { t, i18n } = useTranslation();
  const { apply, patch, refresh } = useHousehold();
  const [removing, setRemoving] = useState<HouseholdMember | null>(null);
  const full = isHouseholdFull(household);
  const alone = !isShared(household);

  const inviteButton = (
    <Button variant={alone ? "primary" : "secondary"} trackId="household.invite" onClick={onInvite} disabled={full}>
      <UserPlus aria-hidden className="h-[18px] w-[18px]" />
      {t("household.manage.invite")}
    </Button>
  );

  return (
    <SettingsCard title={t("household.manage.members")}>
      <ul className="flex flex-col gap-1">
        {household.members.map((member) => (
          <li key={member.userId} className="flex min-h-14 items-center gap-3 rounded-2xl py-1.5">
            <MemberAvatar name={member.displayName} avatarUrl={member.avatarUrl} className="h-11 w-11 text-[44px]" />
            <div className="min-w-0 flex-1">
              <p className="flex min-w-0 items-center gap-2">
                <bdi className="truncate text-[15px] font-semibold text-text">{member.displayName}</bdi>
                {member.isMe ? <TileBadge className="shrink-0">{t("household.manage.you")}</TileBadge> : null}
              </p>
              <p className="text-sm text-muted">{t("household.manage.joined", { date: formatDay(member.joinedAt, i18n.language) })}</p>
            </div>
            {member.isMe ? null : (
              <>
                {/* Wider screens say it in words; a phone keeps the icon so the name has room. Both ask first. */}
                <span className="hidden shrink-0 sm:block">
                  <Button
                    variant="ghost"
                    size="sm"
                    trackId="household.member.remove"
                    aria-label={t("household.manage.removeLabel", { name: member.displayName })}
                    onClick={() => setRemoving(member)}
                    className="text-muted hover:text-danger"
                  >
                    <UserMinus aria-hidden className="h-[18px] w-[18px]" />
                    {t("household.manage.remove")}
                  </Button>
                </span>
                <span className="shrink-0 sm:hidden">
                  <IconButton
                    label={t("household.manage.removeLabel", { name: member.displayName })}
                    trackId="household.member.remove"
                    icon={<UserMinus className="h-[18px] w-[18px]" />}
                    onClick={() => setRemoving(member)}
                    className="hover:text-danger"
                  />
                </span>
              </>
            )}
          </li>
        ))}
      </ul>

      {alone ? (
        <EmptyState
          icon={<Users aria-hidden />}
          title={t("household.manage.onlyYou")}
          body={t("household.manage.onlyYouBody")}
          action={inviteButton}
          className="pt-8 pb-4"
        />
      ) : (
        <div className="mt-4 flex flex-col gap-2 border-t border-border pt-4 sm:flex-row sm:items-center sm:justify-between">
          {full ? <p className="text-sm text-muted">{t("household.invite.full", { count: HOUSEHOLD_MAX_MEMBERS })}</p> : <span />}
          {inviteButton}
        </div>
      )}

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("household.manage.removeTitle", { name: removing?.displayName ?? "" })}
        description={t("household.manage.removeBody")}
        confirmLabel={t("household.manage.removeConfirm")}
        trackId="household.member.remove_dialog"
        onConfirm={async () => {
          if (!removing) return;
          const member = removing;
          // Gone from the list at once; back if it fails.
          patch((current) => ({ ...current, members: current.members.filter((m) => m.userId !== member.userId) }));
          try {
            apply(await removeHouseholdMember(member.userId));
            showToast(t("household.manage.removed", { name: member.displayName }));
          } catch (caught) {
            void refresh();
            showToast(householdErrorText(caught, t), "error");
          }
        }}
      />
    </SettingsCard>
  );
}

/** The name the others see for me. Saved with its own button; shows at once. */
function YourName({ household }: { household: Household }) {
  const { t } = useTranslation();
  const { apply, refresh } = useHousehold();
  const me = household.members.find((member) => member.isMe);
  const saved = me?.displayName ?? "";
  const [draft, setDraft] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const value = draft ?? saved;
  const changed = value.trim() !== saved;

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) {
      setError(t("household.setup.yourNameRequired"));
      return;
    }
    if (!changed) return;
    setBusy(true);
    try {
      apply(await setMyDisplayName(value.trim()));
      setDraft(null);
      showToast(t("household.manage.saved"));
    } catch (caught) {
      void refresh();
      showToast(householdErrorText(caught, t), "error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <SettingsCard title={t("household.manage.yourName")} hint={t("household.setup.yourNameHint")}>
      <form onSubmit={(event) => void save(event)} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <TextField
            label={t("household.setup.yourNameLabel")}
            value={value}
            maxLength={HOUSEHOLD_DISPLAY_NAME_MAX}
            autoComplete="given-name"
            error={error ?? undefined}
            disabled={busy}
            onChange={(event) => {
              setDraft(event.target.value);
              setError(null);
            }}
          />
        </div>
        <Button type="submit" variant="secondary" busy={busy} disabled={!changed} trackId="household.display_name.save" className="sm:mt-7">
          {busy ? t("household.manage.saving") : t("household.manage.save")}
        </Button>
      </form>
    </SettingsCard>
  );
}

/** Leave, taking a copy of the list and pantry. Only when someone else lives here: alone there is nothing to leave. */
function Leave({ household }: { household: Household }) {
  const { t } = useTranslation();
  const { apply } = useHousehold();
  const [open, setOpen] = useState(false);
  const name = household.name ?? "";
  return (
    <SettingsCard title={t("household.manage.leave")} hint={t("household.manage.leaveBody")} tone="danger">
      <Button variant="outline" trackId="household.leave" onClick={() => setOpen(true)} className="text-danger">
        <LogOut aria-hidden className="h-[18px] w-[18px] rtl:rotate-180" />
        {t("household.manage.leave")}
      </Button>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title={t("household.manage.leaveTitle", { name })}
        description={t("household.manage.leaveBody")}
        confirmLabel={t("household.manage.leaveConfirm")}
        trackId="household.leave_dialog"
        onConfirm={async () => {
          try {
            apply(await leaveHousehold());
            showToast(t("household.manage.left", { name }));
          } catch (caught) {
            showToast(householdErrorText(caught, t), "error");
          }
        }}
      />
    </SettingsCard>
  );
}

/** "Have an invite?": paste the link someone sent, and go to its page. */
function PasteInvite() {
  const { t } = useTranslation();
  const router = useRouter();
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);

  function go(event: FormEvent) {
    event.preventDefault();
    const token = inviteTokenFrom(text);
    if (!token) {
      setError(t("household.join.pasteInvalid"));
      return;
    }
    router.push(`/join/${encodeURIComponent(token)}`);
  }

  return (
    <SettingsCard title={t("household.join.pasteTitle")} hint={t("household.join.pasteHint")}>
      <form onSubmit={go} noValidate className="flex flex-col gap-3 sm:flex-row sm:items-start">
        <div className="min-w-0 flex-1">
          <TextField
            label={t("household.join.pasteLabel")}
            value={text}
            dir="ltr"
            inputMode="url"
            autoComplete="off"
            spellCheck={false}
            error={error ?? undefined}
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
          />
        </div>
        <Button type="submit" variant="outline" trackId="household.paste_invite" className="sm:mt-7">
          {t("household.join.pasteButton")}
        </Button>
      </form>
    </SettingsCard>
  );
}
