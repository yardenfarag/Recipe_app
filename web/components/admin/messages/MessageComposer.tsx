"use client";

import { useMemo, useRef, useState } from "react";

import {
  ACTION_LABELS,
  FREQUENCY_LABELS,
  ICON_SUGGESTIONS,
  MESSAGE_LANGUAGES,
  PRESENTATION_HINTS,
  PRESENTATION_LABELS,
  PRESETS,
  SCREEN_SUGGESTIONS,
  TONE_LABELS,
  alertLimits,
  applyPreset,
  draftFromForm,
  formIssues,
  formatLocalTime,
  issuesFor,
  parseUsers,
  presetNeeds,
  resolveUsers,
  setPresentation,
  setRequired,
  splitScreens,
  testDraft,
  type ActionType,
  type ButtonForm,
  type ContentForm,
  type FrequencyType,
  type MessageForm,
  type PresetId,
} from "@shared/lib/adminMessageForm";
import { errorText } from "@shared/lib/errorText";
import { PRESENTATIONS, TONES, validateMessage, type MessageStatus } from "@shared/lib/inAppMessages";
import { saveAdminMessage, setAdminMessageStatus, uploadMessageImage } from "@shared/lib/supabase/adminMessages";
import { fetchAdminPeople } from "@shared/lib/supabase/adminPeople";

import { useAuth } from "@/components/AuthProvider";
import { ErrorLine } from "@/components/admin/ui";
import { Chip, ChipRow, FormGroup, FormSwitch, FormText, MultiChipRow, Section } from "@/components/admin/messages/fields";
import { MessagePreviewCard } from "@/components/admin/messages/MessagePreviewCard";
import { Button } from "@/components/ui/Button";
import { chipClasses } from "@/components/ui/Chip";
import { ConfirmDialog } from "@/components/ui/Dialog";
import { readImageFile } from "@/lib/admin/readImageFile";
import { refreshInAppMessagesNow } from "@/components/inAppMessages/controller";

type Busy = "save" | "live" | "test" | null;

/** The calls the composer makes; tests pass their own. */
export type ComposerApi = {
  save: typeof saveAdminMessage;
  setStatus: typeof setAdminMessageStatus;
  upload: typeof uploadMessageImage;
  people: typeof fetchAdminPeople;
};

const DEFAULT_API: ComposerApi = {
  save: saveAdminMessage,
  setStatus: setAdminMessageStatus,
  upload: uploadMessageImage,
  people: fetchAdminPeople,
};

const ACTION_OPTIONS = (Object.keys(ACTION_LABELS) as ActionType[]).map((value) => ({ value, label: ACTION_LABELS[value] }));
const FREQUENCY_OPTIONS = (Object.keys(FREQUENCY_LABELS) as FrequencyType[]).map((value) => ({ value, label: FREQUENCY_LABELS[value] }));
const LANGUAGE_CHIPS = MESSAGE_LANGUAGES.map((l) => ({ value: l.code as string, label: `${l.label} (${l.code})` }));

function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return "your local time";
  }
}

/**
 * Writes an in-app message: how it looks, its words in each language, its buttons, how often and when it shows,
 * and who gets it. Saving goes through `admin_save_in_app_message`, which only admins may call. The preview sits
 * beside the form on a laptop and after it on a narrower screen.
 */
export function MessageComposer({
  initial,
  initialStatus,
  onCancel,
  onDone,
  api = DEFAULT_API,
}: {
  initial: MessageForm;
  /** Status of the message being edited; null for a new one. */
  initialStatus: MessageStatus | null;
  onCancel: () => void;
  onDone: (notice: string) => void;
  api?: ComposerApi;
}) {
  const { user } = useAuth();
  const [form, setForm] = useState<MessageForm>(initial);
  const [lang, setLang] = useState<string>("en");
  const [showErrors, setShowErrors] = useState(false);
  const [missingEmails, setMissingEmails] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [presetNote, setPresetNote] = useState<string | null>(null);
  const [confirmTest, setConfirmTest] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const update = (patch: Partial<MessageForm>) => setForm((current) => ({ ...current, ...patch }));
  const updateContent = (language: string, patch: Partial<ContentForm>) =>
    setForm((current) => ({ ...current, content: { ...current.content, [language]: { ...current.content[language]!, ...patch } } }));

  const parsed = useMemo(() => parseUsers(form.users), [form.users]);
  const issues = useMemo(() => formIssues(form, parsed, missingEmails), [form, parsed, missingEmails]);
  const previewDraft = useMemo(() => draftFromForm(form, parsed.ids), [form, parsed]);
  const limits = alertLimits(form);
  const live = initialStatus === "live" || initialStatus === "scheduled";
  const errs = (field: string, deep = false): string[] => (showErrors ? issuesFor(issues, field, deep) : []);

  async function sendTest() {
    if (!user) throw new Error("You need to be signed in to send a test.");
    const saved = await api.save(testDraft(form, user.id));
    await api.setStatus(saved.id, "live");
    // Shown here at once (this tab checks again now); on other devices at their next launch.
    refreshInAppMessagesNow();
    onDone(`Sent “${saved.name}” to you only. It shows here now, and on your other devices at their next launch. Stop it from the list when you are done.`);
  }

  async function run(work: () => Promise<void>, mode: Exclude<Busy, null>) {
    setError(null);
    setBusy(mode);
    try {
      await work();
    } catch (err) {
      setError(errorText(err, "Could not save the message."));
    } finally {
      setBusy(null);
    }
  }

  async function submit(mode: Exclude<Busy, null>) {
    setShowErrors(true);
    if (mode === "test") {
      if (!user) {
        setError("You need to be signed in to send a test.");
        return;
      }
      const found = validateMessage(testDraft(form, user.id)).length + issuesFor(issues, "link").length;
      if (found > 0) return; // shown beside the fields
      if (form.required) {
        setConfirmTest(true);
        return;
      }
      await run(sendTest, "test");
      return;
    }
    await run(async () => {
      let userIds = parsed.ids;
      let missing: string[] = [];
      if (parsed.emails.length > 0) {
        const resolved = resolveUsers(parsed, await api.people());
        userIds = resolved.userIds;
        missing = resolved.missing;
      }
      setMissingEmails(missing);
      if (formIssues(form, parsed, missing).length > 0) return;
      const saved = await api.save(draftFromForm(form, userIds));
      if (mode === "live") await api.setStatus(saved.id, "live");
      onDone(mode === "live" ? `“${saved.name}” is live.` : `Saved “${saved.name}”.`);
    }, mode);
  }

  async function uploadImage(file: File) {
    setError(null);
    setUploading(true);
    try {
      const { base64, ext } = await readImageFile(file);
      update({ imageUrl: await api.upload(base64, ext) });
    } catch (err) {
      setError(errorText(err, "Could not upload the image."));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  function choosePreset(id: PresetId) {
    setForm((current) => applyPreset(current, id));
    setPresetNote(presetNeeds(id));
  }

  function toggleScreen(screen: string) {
    const current = splitScreens(form.screens);
    update({ screens: (current.includes(screen) ? current.filter((s) => s !== screen) : [...current, screen]).join("\n") });
  }

  const content = form.content[lang] ?? form.content.en!;
  const langMeta = MESSAGE_LANGUAGES.find((l) => l.code === lang);
  const rtl = langMeta?.rtl ?? false;

  function buttonEditor(which: "primary" | "secondary") {
    const button = form[which];
    const title = which === "primary" ? "Primary button" : "Secondary button";
    const field = which === "primary" ? "primaryAction" : "secondaryAction";
    const set = (patch: Partial<ButtonForm>) => update({ [which]: { ...button, ...patch } } as Partial<MessageForm>);
    return (
      <div key={which} className="flex flex-col gap-3">
        <FormSwitch
          label={title}
          hint={which === "primary" ? "Write its label under Words, for each language." : undefined}
          checked={button.enabled}
          onChange={(enabled) => set({ enabled })}
          trackId={`admin.messages.${which}.toggle`}
        />
        {button.enabled ? (
          <>
            <FormGroup label={`${title}: what it does`} errors={errs(field)}>
              <ChipRow options={ACTION_OPTIONS} value={button.action} onChange={(action) => set({ action })} trackPrefix={`admin.messages.${which}.action`} />
            </FormGroup>
            {button.action === "link" || button.action === "route" ? (
              <FormText
                label={button.action === "link" ? `${title}: web address` : `${title}: app screen`}
                hint={button.action === "link" ? "Opens in the in-app browser. Must start with https://" : "A path inside the app, such as /(tabs)/hub"}
                value={button.target}
                onChange={(target) => set({ target })}
                placeholder={button.action === "link" ? "https://…" : "/(tabs)/hub"}
                inputMode={button.action === "link" ? "url" : "text"}
                errors={errs(field)}
              />
            ) : null}
            {button.action === "store" ? (
              <p className="text-sm text-muted">Opens the App Store or Google Play page that fits the device. On web, the page that fits the browser.</p>
            ) : null}
          </>
        ) : (
          errs(field).map((message) => (
            <p key={message} role="alert" className="text-sm font-medium text-danger">
              {message}
            </p>
          ))
        )}
      </div>
    );
  }

  return (
    <div className="grid items-start gap-5 @4xl:grid-cols-[minmax(0,1fr)_22rem]">
      <div className="flex min-w-0 flex-col gap-5">
        <Section title="Start from" hint="Fills the way of showing, buttons and who gets it. Your name, words and image stay.">
          <div className="flex flex-wrap gap-2">
            {PRESETS.map((preset) => (
              <Button
                key={preset.id}
                size="sm"
                variant="secondary"
                title={preset.hint}
                trackId={`admin.messages.preset.${preset.id}`}
                onClick={() => choosePreset(preset.id)}
              >
                {preset.label}
              </Button>
            ))}
          </div>
          {presetNote ? <p className="text-sm font-semibold text-warning">{presetNote}</p> : null}
        </Section>

        <Section title="How it looks">
          <FormText label="Name" hint="Only admins see this." required value={form.name} onChange={(name) => update({ name })} placeholder="Spring update" errors={errs("name")} />
          <FormGroup label="How it is shown" hint={PRESENTATION_HINTS[form.presentation]} errors={errs("presentation")}>
            <ChipRow
              options={PRESENTATIONS.map((value) => ({ value, label: PRESENTATION_LABELS[value] }))}
              value={form.presentation}
              onChange={(presentation) => setForm((current) => setPresentation(current, presentation))}
              trackPrefix="admin.messages.presentation"
            />
          </FormGroup>
          {form.presentation === "banner" ? (
            <FormGroup label="Banner position">
              <ChipRow
                options={[
                  { value: "top", label: "Top" },
                  { value: "bottom", label: "Bottom" },
                ]}
                value={form.bannerPosition}
                onChange={(bannerPosition) => update({ bannerPosition })}
                trackPrefix="admin.messages.banner_position"
              />
            </FormGroup>
          ) : null}
          <FormGroup label="Tone" errors={errs("tone")}>
            <ChipRow options={TONES.map((value) => ({ value, label: TONE_LABELS[value] }))} value={form.tone} onChange={(tone) => update({ tone })} trackPrefix="admin.messages.tone" />
          </FormGroup>
          <FormGroup label="Icon suggestions" hint={limits.icon ? "Pick one, or type any Ionicons name below." : "A system alert can’t show an icon."}>
            <div className="flex flex-wrap gap-2">
              {ICON_SUGGESTIONS.map((name) => (
                <Chip
                  key={name}
                  pressed={form.icon === name}
                  disabled={!limits.icon}
                  trackId="admin.messages.icon.pick"
                  onClick={() => update({ icon: form.icon === name ? "" : name })}
                >
                  {name}
                </Chip>
              ))}
            </div>
          </FormGroup>
          <FormText
            label="Icon name"
            hint={limits.icon ? "An Ionicons name, such as gift-outline. Optional." : undefined}
            value={form.icon}
            onChange={(icon) => update({ icon })}
            placeholder="gift-outline"
            disabled={!limits.icon}
            errors={errs("icon")}
          />
          <div className="flex flex-col gap-2">
            <FormText
              label="Image address"
              hint={
                limits.image
                  ? "Paste a web address (https://) or upload one. Uploads go to the recipe-thumbnails bucket."
                  : "A system alert can’t show an image. Pick another way of showing."
              }
              value={form.imageUrl}
              onChange={(imageUrl) => update({ imageUrl })}
              placeholder="https://…"
              inputMode="url"
              disabled={!limits.image}
              errors={errs("imageUrl")}
            />
            <input
              ref={fileInput}
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif,image/avif"
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="secondary"
                trackId="admin.messages.image.upload"
                disabled={!limits.image}
                busy={uploading}
                onClick={() => fileInput.current?.click()}
              >
                Upload image
              </Button>
              {form.imageUrl ? (
                <Button size="sm" variant="ghost" className="text-danger" trackId="admin.messages.image.remove" disabled={!limits.image} onClick={() => update({ imageUrl: "" })}>
                  Remove
                </Button>
              ) : null}
            </div>
            {form.imageUrl && limits.image ? (
              // An image the admin pasted or just uploaded: shown as it is.
              // eslint-disable-next-line @next/next/no-img-element
              <img src={form.imageUrl} alt="Selected image" className="h-36 w-full max-w-sm rounded-2xl bg-element object-cover" />
            ) : null}
          </div>
        </Section>

        <Section title="Words" hint="English is required. Users in a language with no text see English. Hebrew and Arabic are typed right-to-left.">
          <div role="tablist" aria-label="Language of the words" className="flex flex-wrap gap-2">
            {MESSAGE_LANGUAGES.map((l) => {
              const active = l.code === lang;
              const written = (form.content[l.code]?.title ?? "").trim().length > 0;
              const broken = errs(`content.${l.code}`, true).length > 0;
              return (
                <button
                  key={l.code}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  data-track={`admin.messages.content.tab.${l.code}`}
                  onClick={() => setLang(l.code)}
                  aria-label={`${l.label}${written ? ", written" : ", empty"}${broken ? ", has errors" : ""}`}
                  className={chipClasses({ selected: active, size: "sm", className: broken ? "ring-2 ring-danger" : undefined })}
                >
                  {l.label}
                  {written ? " ✓" : ""}
                  {broken ? " !" : ""}
                </button>
              );
            })}
          </div>
          <FormText
            label={`Title in ${langMeta?.label}`}
            required={lang === "en"}
            value={content.title}
            onChange={(title) => updateContent(lang, { title })}
            rtl={rtl}
            errors={errs(`content.${lang}.title`).concat(errs(`content.${lang}`))}
          />
          <FormText
            label={`Body in ${langMeta?.label}`}
            hint={`${content.body.length} of 1500 characters`}
            value={content.body}
            onChange={(body) => updateContent(lang, { body })}
            rtl={rtl}
            lines={4}
            errors={errs(`content.${lang}.body`)}
          />
          {form.primary.enabled ? (
            <FormText
              label={`Primary button label in ${langMeta?.label}`}
              hint={lang === "en" ? undefined : "Empty uses the English label."}
              value={content.primaryLabel}
              onChange={(primaryLabel) => updateContent(lang, { primaryLabel })}
              rtl={rtl}
              errors={errs(`content.${lang}.primaryLabel`)}
            />
          ) : null}
          {form.secondary.enabled ? (
            <FormText
              label={`Secondary button label in ${langMeta?.label}`}
              hint={lang === "en" ? undefined : "Empty uses the English label."}
              value={content.secondaryLabel}
              onChange={(secondaryLabel) => updateContent(lang, { secondaryLabel })}
              rtl={rtl}
              errors={errs(`content.${lang}.secondaryLabel`)}
            />
          ) : null}
          {form.linkUrl.trim() && limits.link ? (
            <FormText
              label={`Link label in ${langMeta?.label}`}
              hint={lang === "en" ? undefined : "Empty uses the English label."}
              value={content.linkLabel}
              onChange={(linkLabel) => updateContent(lang, { linkLabel })}
              rtl={rtl}
              errors={errs(`content.${lang}.linkLabel`)}
            />
          ) : null}
        </Section>

        <Section
          title="Buttons and link"
          hint={form.presentation === "alert" ? "A system alert takes at most two buttons and no link." : "Up to two buttons, and an optional link under the words."}
        >
          {buttonEditor("primary")}
          {buttonEditor("secondary")}
          <FormText
            label="Link (optional)"
            hint={limits.link ? "A web address, opened in the in-app browser." : "A system alert can’t show a link."}
            value={form.linkUrl}
            onChange={(linkUrl) => update({ linkUrl })}
            placeholder="https://…"
            inputMode="url"
            disabled={!limits.link}
            errors={errs("link")}
          />
        </Section>

        <Section title="How often">
          <FormSwitch
            label="Required"
            hint="Cannot be closed and keeps coming back until the user no longer matches. Shows full screen, so this switches the way of showing."
            checked={form.required}
            onChange={(required) => setForm((current) => setRequired(current, required))}
            trackId="admin.messages.required"
          />
          <FormSwitch
            label="Can be closed"
            hint={form.required ? "A required message can’t be closed." : undefined}
            checked={form.dismissible && !form.required}
            onChange={(dismissible) => update({ dismissible })}
            disabled={form.required}
            trackId="admin.messages.dismissible"
          />
          <FormGroup label="Shows" hint={form.required ? "A required message ignores this and max shows." : undefined} errors={errs("frequency")}>
            <ChipRow options={FREQUENCY_OPTIONS} value={form.frequency} onChange={(frequency) => update({ frequency })} trackPrefix="admin.messages.frequency" />
          </FormGroup>
          {form.frequency === "every_n_days" ? (
            <FormText label="Days between shows" inputMode="numeric" value={form.everyNDays} onChange={(everyNDays) => update({ everyNDays })} errors={errs("frequency")} />
          ) : null}
          <div className="grid gap-4 @2xl:grid-cols-3">
            <FormText
              label="Max shows per user (optional)"
              hint="Stops after this many times."
              inputMode="numeric"
              placeholder="No limit"
              value={form.maxShows}
              onChange={(maxShows) => update({ maxShows })}
              errors={errs("maxShows")}
            />
            <FormText
              label="Priority"
              hint="When several messages are due, the highest goes first."
              inputMode="numeric"
              value={form.priority}
              onChange={(priority) => update({ priority })}
              errors={errs("priority")}
            />
            <FormText
              label="Delay in seconds (optional)"
              hint="Wait this long after the screen opens."
              inputMode="numeric"
              placeholder="0"
              value={form.delaySeconds}
              onChange={(delaySeconds) => update({ delaySeconds })}
              errors={errs("delaySeconds")}
            />
          </div>
          <FormGroup label="Screen suggestions">
            <div className="flex flex-wrap gap-2">
              {SCREEN_SUGGESTIONS.map((screen) => (
                <Chip
                  key={screen}
                  pressed={splitScreens(form.screens).includes(screen)}
                  trackId="admin.messages.screens.toggle"
                  onClick={() => toggleScreen(screen)}
                >
                  {screen}
                </Chip>
              ))}
            </div>
          </FormGroup>
          <FormText
            label="Only on these screens (optional)"
            hint="One route per line. Empty means anywhere."
            lines={3}
            placeholder="/(tabs)/hub"
            value={form.screens}
            onChange={(screens) => update({ screens })}
            errors={errs("screens")}
          />
        </Section>

        <Section title="When" hint={`Your local time (${timeZoneName()}), as YYYY-MM-DD HH:mm. Empty means no limit.`}>
          <div className="grid gap-4 @2xl:grid-cols-2">
            {(["startsAt", "endsAt"] as const).map((key) => (
              <div key={key} className="flex flex-col gap-2">
                <FormText
                  label={key === "startsAt" ? "Starts" : "Ends"}
                  placeholder="2026-12-01 09:00"
                  value={form[key]}
                  onChange={(text) => update({ [key]: text } as Partial<MessageForm>)}
                  errors={errs(key)}
                />
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="secondary"
                    trackId={`admin.messages.${key}.now`}
                    aria-label={`${key === "startsAt" ? "Start" : "End"} now`}
                    onClick={() => update({ [key]: formatLocalTime(new Date().toISOString()) } as Partial<MessageForm>)}
                  >
                    Now
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    trackId={`admin.messages.${key}.clear`}
                    aria-label={`Clear the ${key === "startsAt" ? "start" : "end"}`}
                    disabled={!form[key]}
                    onClick={() => update({ [key]: "" } as Partial<MessageForm>)}
                  >
                    Clear
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="text-sm text-muted">Nothing shows until the message is live. A live message with a start in the future shows as scheduled.</p>
        </Section>

        <Section title="Who gets it" hint="Signed-in users only. Leave a box empty to not narrow by it. With everything empty it goes to everyone.">
          <FormText
            label="Users (optional)"
            hint="User IDs or emails, separated by commas, spaces or new lines."
            lines={3}
            placeholder="person@example.com"
            value={form.users}
            onChange={(users) => update({ users })}
            errors={errs("targeting.userIds")}
          />
          <FormGroup label="Plan">
            <MultiChipRow
              options={[
                { value: "free", label: "Free" },
                { value: "pro", label: "Pro" },
              ]}
              value={form.plans}
              onChange={(plans) => update({ plans })}
              trackPrefix="admin.messages.plan"
            />
          </FormGroup>
          <FormGroup label="Platform" errors={errs("targeting.platforms")}>
            <MultiChipRow
              options={[
                { value: "ios", label: "iOS" },
                { value: "android", label: "Android" },
                { value: "web", label: "Web" },
              ]}
              value={form.platforms}
              onChange={(platforms) => update({ platforms })}
              trackPrefix="admin.messages.platform"
            />
          </FormGroup>
          <FormGroup label="App language" errors={errs("targeting.languages")}>
            <MultiChipRow options={LANGUAGE_CHIPS} value={form.languages} onChange={(languages) => update({ languages })} trackPrefix="admin.messages.audience_language" />
          </FormGroup>
          <div className="grid gap-4 @2xl:grid-cols-2">
            <FormText
              label="From version (optional)"
              hint="This version and above."
              placeholder="1.4.0"
              value={form.minAppVersion}
              onChange={(minAppVersion) => update({ minAppVersion })}
              errors={errs("targeting.minAppVersion")}
            />
            <FormText
              label="Below version (optional)"
              hint="Versions under this one. Use it for “update the app”."
              placeholder="1.5.0"
              value={form.maxAppVersion}
              onChange={(maxAppVersion) => update({ maxAppVersion })}
              errors={errs("targeting.maxAppVersion")}
            />
          </div>
        </Section>

        <Section>
          {showErrors && issues.length > 0 ? (
            <p role="alert" className="text-sm font-semibold text-danger">
              {issues.length === 1 ? "Fix 1 thing marked above." : `Fix ${issues.length} things marked above.`}
            </p>
          ) : null}
          {error ? <ErrorLine>{error}</ErrorLine> : null}
          <div className="flex flex-wrap gap-2">
            <Button trackId="admin.messages.composer.save" busy={busy === "save"} disabled={busy !== null} onClick={() => void submit("save")}>
              Save
            </Button>
            {!live ? (
              <Button trackId="admin.messages.composer.save_live" busy={busy === "live"} disabled={busy !== null} onClick={() => void submit("live")}>
                Save and go live
              </Button>
            ) : null}
            <Button variant="secondary" trackId="admin.messages.composer.send_to_me" busy={busy === "test"} disabled={busy !== null} onClick={() => void submit("test")}>
              Send to me only
            </Button>
            <Button variant="ghost" trackId="admin.messages.composer.cancel" disabled={busy !== null} onClick={onCancel}>
              Cancel
            </Button>
          </div>
          <p className="text-sm text-muted">
            “Send to me only” saves a separate live copy that goes to your own account, with no start or end time, shown on every launch. Stop it
            from the list afterwards.
          </p>
        </Section>
      </div>

      {/* Beside the form on a laptop, where it stays in view while scrolling; after it on a narrower screen. */}
      <aside aria-label="Preview" className="@4xl:sticky @4xl:top-6">
        <MessagePreviewCard draft={previewDraft} />
      </aside>

      <ConfirmDialog
        open={confirmTest}
        onOpenChange={setConfirmTest}
        title="Send a test copy?"
        description="This message can’t be closed on your device. Stop it from the list, on the website or another device, when you are done."
        confirmLabel="Send"
        confirmVariant="primary"
        onConfirm={() => run(sendTest, "test")}
      />
    </div>
  );
}
