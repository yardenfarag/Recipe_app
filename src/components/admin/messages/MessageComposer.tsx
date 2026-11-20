import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Platform, Text, View, type ViewStyle } from 'react-native';

import {
  ActionButton,
  Card,
  ChipRow,
  Field,
  MultiChipRow,
  SwitchRow,
  TextField,
} from '@/components/admin/messages/fields';
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
} from '@/components/admin/messages/form';
import { MessagePreview } from '@/components/admin/messages/MessagePreview';
import { Pressable } from '@/components/ui/Pressable';
import { useAuth } from '@/hooks/useAuth';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { useThemePreference } from '@/hooks/useThemePreference';
import { confirmAction } from '@/lib/confirmAction';
import { errorText } from '@shared/lib/errorText';
import {
  PRESENTATIONS,
  TONES,
  validateMessage,
  type MessageIssue,
  type MessageStatus,
} from '@shared/lib/inAppMessages';
import {
  saveAdminMessage,
  setAdminMessageStatus,
  uploadMessageImage,
} from '@shared/lib/supabase/adminMessages';
import { fetchAdminPeople } from '@shared/lib/supabase/adminPeople';

type Props = {
  initial: MessageForm;
  /** Status of the message being edited; null for a new one. */
  initialStatus: MessageStatus | null;
  onCancel: () => void;
  onDone: (notice: string) => void;
};

type Busy = 'save' | 'live' | 'test' | null;

const ACTION_OPTIONS = (Object.keys(ACTION_LABELS) as ActionType[]).map((value) => ({ value, label: ACTION_LABELS[value] }));
const FREQUENCY_OPTIONS = (Object.keys(FREQUENCY_LABELS) as FrequencyType[]).map((value) => ({
  value,
  label: FREQUENCY_LABELS[value],
}));
const LANGUAGE_CHIPS = MESSAGE_LANGUAGES.map((l) => ({ value: l.code, label: `${l.label} (${l.code})` }));

function timeZoneName(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone;
  } catch {
    return 'your local time';
  }
}

export function MessageComposer({ initial, initialStatus, onCancel, onDone }: Props) {
  const { colors } = useThemePreference();
  const { user } = useAuth();
  const { isWide } = useBreakpoint();

  const [form, setForm] = useState<MessageForm>(initial);
  const [lang, setLang] = useState<string>('en');
  const [showErrors, setShowErrors] = useState(false);
  const [missingEmails, setMissingEmails] = useState<string[]>([]);
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [presetNote, setPresetNote] = useState<string | null>(null);

  const update = (patch: Partial<MessageForm>) => setForm((current) => ({ ...current, ...patch }));
  const updateContent = (language: string, patch: Partial<ContentForm>) =>
    setForm((current) => ({
      ...current,
      content: { ...current.content, [language]: { ...current.content[language]!, ...patch } },
    }));

  const parsed = useMemo(() => parseUsers(form.users), [form.users]);
  const issues: MessageIssue[] = useMemo(
    () => formIssues(form, parsed, missingEmails),
    [form, parsed, missingEmails],
  );
  const previewDraft = useMemo(() => draftFromForm(form, parsed.ids), [form, parsed]);
  const limits = alertLimits(form);
  const live = initialStatus === 'live' || initialStatus === 'scheduled';

  const errs = (field: string, deep = false): string[] => (showErrors ? issuesFor(issues, field, deep) : []);

  async function submit(mode: Exclude<Busy, null>) {
    setShowErrors(true);
    setError(null);
    setBusy(mode);
    try {
      if (mode === 'test') {
        if (!user) throw new Error('You need to be signed in to send a test.');
        const draft = testDraft(form, user.id);
        const found = validateMessage(draft).concat(
          issuesFor(issues, 'link').map((message) => ({ field: 'link', message })),
        );
        if (found.length > 0) return; // shown beside the fields
        if (form.required) {
          const ok = await confirmAction(
            'Send a test copy?',
            'This message can’t be closed on your device. Stop it from the list, on the website or another device, when you are done.',
            'Send',
          );
          if (!ok) return;
        }
        const saved = await saveAdminMessage(draft);
        await setAdminMessageStatus(saved.id, 'live');
        onDone(`Sent “${saved.name}” to you only. It shows on this device now and on your others at their next launch. Stop it from the list when you are done.`);
        return;
      }

      let userIds = parsed.ids;
      let missing: string[] = [];
      if (parsed.emails.length > 0) {
        const resolved = resolveUsers(parsed, await fetchAdminPeople());
        userIds = resolved.userIds;
        missing = resolved.missing;
      }
      setMissingEmails(missing);
      if (formIssues(form, parsed, missing).length > 0) return;

      const saved = await saveAdminMessage(draftFromForm(form, userIds));
      if (mode === 'live') await setAdminMessageStatus(saved.id, 'live');
      onDone(mode === 'live' ? `“${saved.name}” is live.` : `Saved “${saved.name}”.`);
    } catch (err) {
      setError(errorText(err, 'Could not save the message.'));
    } finally {
      setBusy(null);
    }
  }

  async function pickImage() {
    setError(null);
    try {
      const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setError('Allow access to your photos to upload an image.');
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ['images'],
        allowsEditing: false,
        quality: 0.8,
        base64: true,
      });
      if (result.canceled || !result.assets[0]) return;
      const asset = result.assets[0];
      if (!asset.base64) {
        setError('Could not read that image.');
        return;
      }
      setUploading(true);
      const ext =
        asset.mimeType?.split('/')[1]?.toLowerCase() ?? asset.uri.split('.').pop()?.toLowerCase() ?? 'jpg';
      update({ imageUrl: await uploadMessageImage(asset.base64, ext) });
    } catch (err) {
      setError(errorText(err, 'Could not upload the image.'));
    } finally {
      setUploading(false);
    }
  }

  function choosePreset(id: (typeof PRESETS)[number]['id']) {
    setForm((current) => applyPreset(current, id));
    setPresetNote(presetNeeds(id));
  }

  function toggleScreen(screen: string) {
    const current = splitScreens(form.screens);
    update({ screens: (current.includes(screen) ? current.filter((s) => s !== screen) : [...current, screen]).join('\n') });
  }

  const content = form.content[lang] ?? form.content.en!;
  const langMeta = MESSAGE_LANGUAGES.find((l) => l.code === lang);
  const rtl = langMeta?.rtl ?? false;

  function buttonEditor(which: 'primary' | 'secondary') {
    const button = form[which];
    const title = which === 'primary' ? 'Primary button' : 'Secondary button';
    const field = which === 'primary' ? 'primaryAction' : 'secondaryAction';
    const set = (patch: Partial<ButtonForm>) => update({ [which]: { ...button, ...patch } } as Partial<MessageForm>);
    return (
      <View key={which} className="mb-2">
        <SwitchRow
          label={title}
          hint={which === 'primary' ? 'Write its label under Words, for each language.' : undefined}
          value={button.enabled}
          onChange={(enabled) => set({ enabled })}
        />
        {button.enabled ? (
          <View className="mb-4">
            <Field label={`${title}: what it does`} errors={errs(field)}>
              <ChipRow
                options={ACTION_OPTIONS}
                value={button.action}
                onChange={(action) => set({ action })}
                trackPrefix={`admin.messages.${which}.action`}
                label={`${title} action`}
              />
            </Field>
            {button.action === 'link' || button.action === 'route' ? (
              <Field
                label={button.action === 'link' ? 'Web address' : 'App screen'}
                hint={
                  button.action === 'link'
                    ? 'Opens in the in-app browser. Must start with https://'
                    : 'A path inside the app, such as /(tabs)/hub'
                }
              >
                <TextField
                  label={`${title} target`}
                  value={button.target}
                  onChangeText={(target) => set({ target })}
                  placeholder={button.action === 'link' ? 'https://…' : '/(tabs)/hub'}
                  keyboardType="url"
                  invalid={errs(field).length > 0}
                />
              </Field>
            ) : null}
            {button.action === 'store' ? (
              <Text className="text-xs" style={{ color: colors.textSecondary }}>
                Opens the App Store or Google Play page that fits the device. On web, the page that fits the browser.
              </Text>
            ) : null}
          </View>
        ) : (
          errs(field).map((message) => (
            <Text key={message} className="mb-3 text-xs font-semibold" style={{ color: colors.danger }} accessibilityRole="alert">
              {message}
            </Text>
          ))
        )}
      </View>
    );
  }

  const stickyPreview: ViewStyle | null =
    Platform.OS === 'web' ? ({ position: 'sticky', top: 16 } as unknown as ViewStyle) : null;

  const formColumn = (
    <View className="min-w-0 flex-1">
      <Card title="Start from" hint="Fills the way of showing, buttons and who gets it. Your name, words and image stay.">
        <View className="flex-row flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <Pressable
              key={preset.id}
              trackId={`admin.messages.preset.${preset.id}`}
              onPress={() => choosePreset(preset.id)}
              accessibilityRole="button"
              accessibilityLabel={preset.label}
              accessibilityHint={preset.hint}
              className="rounded-[14px] px-3 py-2"
              style={{ backgroundColor: colors.primarySoft }}
            >
              <Text className="text-xs font-bold" style={{ color: colors.primary }}>
                {preset.label}
              </Text>
            </Pressable>
          ))}
        </View>
        {presetNote ? (
          <Text className="mt-3 text-xs font-semibold" style={{ color: colors.warning }}>
            {presetNote}
          </Text>
        ) : null}
      </Card>

      <Card title="How it looks">
        <Field label="Name" hint="Only admins see this." errors={errs('name')} required>
          <TextField label="Name" value={form.name} onChangeText={(name) => update({ name })} placeholder="Spring update" invalid={errs('name').length > 0} />
        </Field>

        <Field label="How it is shown" hint={PRESENTATION_HINTS[form.presentation]} errors={errs('presentation')}>
          <ChipRow
            options={PRESENTATIONS.map((value) => ({ value, label: PRESENTATION_LABELS[value] }))}
            value={form.presentation}
            onChange={(presentation) => setForm((current) => setPresentation(current, presentation))}
            trackPrefix="admin.messages.presentation"
            label="How it is shown"
          />
        </Field>

        {form.presentation === 'banner' ? (
          <Field label="Banner position">
            <ChipRow
              options={[
                { value: 'top', label: 'Top' },
                { value: 'bottom', label: 'Bottom' },
              ]}
              value={form.bannerPosition}
              onChange={(bannerPosition) => update({ bannerPosition })}
              trackPrefix="admin.messages.banner_position"
              label="Banner position"
            />
          </Field>
        ) : null}

        <Field label="Tone" errors={errs('tone')}>
          <ChipRow
            options={TONES.map((value) => ({ value, label: TONE_LABELS[value] }))}
            value={form.tone}
            onChange={(tone) => update({ tone })}
            trackPrefix="admin.messages.tone"
            label="Tone"
          />
        </Field>

        <Field
          label="Icon"
          hint={limits.icon ? 'An Ionicons name, such as gift-outline. Optional.' : 'A system alert can’t show an icon.'}
          errors={errs('icon')}
        >
          <View className="mb-2 flex-row flex-wrap gap-2">
            {ICON_SUGGESTIONS.map((name) => {
              const active = form.icon === name;
              return (
                <Pressable
                  key={name}
                  trackId="admin.messages.icon.pick"
                  onPress={() => update({ icon: active ? '' : name })}
                  disabled={!limits.icon}
                  accessibilityRole="button"
                  accessibilityLabel={`Icon ${name}`}
                  accessibilityState={{ selected: active, disabled: !limits.icon }}
                  className="h-10 w-10 items-center justify-center rounded-full"
                  style={{ backgroundColor: active ? colors.primary : colors.primarySoft, opacity: limits.icon ? 1 : 0.4 }}
                >
                  <Ionicons name={name} size={20} color={active ? colors.onPrimary : colors.primary} />
                </Pressable>
              );
            })}
          </View>
          <TextField label="Icon name" value={form.icon} onChangeText={(icon) => update({ icon })} placeholder="gift-outline" disabled={!limits.icon} invalid={errs('icon').length > 0} />
        </Field>

        <Field
          label="Image"
          hint={
            limits.image
              ? 'Paste a web address (https://) or upload one. Uploads go to the recipe-thumbnails bucket.'
              : 'A system alert can’t show an image. Pick another way of showing.'
          }
          errors={errs('imageUrl')}
        >
          <TextField label="Image address" value={form.imageUrl} onChangeText={(imageUrl) => update({ imageUrl })} placeholder="https://…" keyboardType="url" disabled={!limits.image} invalid={errs('imageUrl').length > 0} />
          <View className="mt-2 flex-row flex-wrap items-center gap-2">
            <ActionButton label="Upload image" kind="soft" trackId="admin.messages.image.upload" onPress={() => void pickImage()} disabled={!limits.image} busy={uploading} />
            {form.imageUrl ? (
              <ActionButton label="Remove" kind="danger" trackId="admin.messages.image.remove" onPress={() => update({ imageUrl: '' })} disabled={!limits.image} />
            ) : null}
          </View>
          {form.imageUrl && limits.image ? (
            <Image
              source={{ uri: form.imageUrl }}
              style={{ width: '100%', maxWidth: 360, height: 140, borderRadius: 12, marginTop: 8, backgroundColor: colors.primarySoft }}
              contentFit="cover"
              accessibilityLabel="Selected image"
            />
          ) : null}
        </Field>
      </Card>

      <Card title="Words" hint="English is required. Users in a language with no text see English. Hebrew and Arabic are typed right-to-left.">
        <View className="mb-3 flex-row flex-wrap gap-2" accessibilityRole="tablist">
          {MESSAGE_LANGUAGES.map((l) => {
            const active = l.code === lang;
            const written = (form.content[l.code]?.title ?? '').trim().length > 0;
            const broken = errs(`content.${l.code}`, true).length > 0;
            return (
              <Pressable
                key={l.code}
                trackId={`admin.messages.content.tab.${l.code}`}
                onPress={() => setLang(l.code)}
                accessibilityRole="tab"
                accessibilityLabel={`${l.label}${written ? ', written' : ', empty'}${broken ? ', has errors' : ''}`}
                accessibilityState={{ selected: active }}
                className="rounded-full px-4 py-2"
                style={{
                  backgroundColor: active ? colors.primary : colors.primarySoft,
                  borderWidth: broken ? 2 : 0,
                  borderColor: colors.danger,
                }}
              >
                <Text className="text-xs font-bold" style={{ color: active ? colors.onPrimary : colors.primary }}>
                  {l.label}
                  {written ? ' ✓' : ''}
                  {broken ? ' !' : ''}
                </Text>
              </Pressable>
            );
          })}
        </View>

        <Field label="Title" errors={errs(`content.${lang}.title`).concat(errs(`content.${lang}`))} required={lang === 'en'}>
          <TextField label={`Title in ${langMeta?.label}`} value={content.title} onChangeText={(title) => updateContent(lang, { title })} rtl={rtl} invalid={errs(`content.${lang}.title`).length > 0} />
        </Field>
        <Field label="Body" errors={errs(`content.${lang}.body`)} hint={`${content.body.length} of 1500 characters`}>
          <TextField label={`Body in ${langMeta?.label}`} value={content.body} onChangeText={(body) => updateContent(lang, { body })} rtl={rtl} multiline lines={4} invalid={errs(`content.${lang}.body`).length > 0} />
        </Field>
        {form.primary.enabled ? (
          <Field label="Primary button label" hint={lang === 'en' ? undefined : 'Empty uses the English label.'} errors={errs(`content.${lang}.primaryLabel`)}>
            <TextField label={`Primary button label in ${langMeta?.label}`} value={content.primaryLabel} onChangeText={(primaryLabel) => updateContent(lang, { primaryLabel })} rtl={rtl} invalid={errs(`content.${lang}.primaryLabel`).length > 0} />
          </Field>
        ) : null}
        {form.secondary.enabled ? (
          <Field label="Secondary button label" hint={lang === 'en' ? undefined : 'Empty uses the English label.'} errors={errs(`content.${lang}.secondaryLabel`)}>
            <TextField label={`Secondary button label in ${langMeta?.label}`} value={content.secondaryLabel} onChangeText={(secondaryLabel) => updateContent(lang, { secondaryLabel })} rtl={rtl} invalid={errs(`content.${lang}.secondaryLabel`).length > 0} />
          </Field>
        ) : null}
        {form.linkUrl.trim() && limits.link ? (
          <Field label="Link label" hint={lang === 'en' ? undefined : 'Empty uses the English label.'} errors={errs(`content.${lang}.linkLabel`)}>
            <TextField label={`Link label in ${langMeta?.label}`} value={content.linkLabel} onChangeText={(linkLabel) => updateContent(lang, { linkLabel })} rtl={rtl} invalid={errs(`content.${lang}.linkLabel`).length > 0} />
          </Field>
        ) : null}
      </Card>

      {isWide ? null : <MessagePreview draft={previewDraft} />}

      <Card
        title="Buttons and link"
        hint={
          form.presentation === 'alert'
            ? 'A system alert takes at most two buttons and no link.'
            : 'Up to two buttons, and an optional link under the words.'
        }
      >
        {buttonEditor('primary')}
        {buttonEditor('secondary')}
        <Field
          label="Link (optional)"
          hint={limits.link ? 'A web address, opened in the in-app browser.' : 'A system alert can’t show a link.'}
          errors={errs('link')}
        >
          <TextField label="Link address" value={form.linkUrl} onChangeText={(linkUrl) => update({ linkUrl })} placeholder="https://…" keyboardType="url" disabled={!limits.link} invalid={errs('link').length > 0} />
        </Field>
      </Card>

      <Card title="How often">
        <SwitchRow
          label="Required"
          hint="Cannot be closed and keeps coming back until the user no longer matches. Shows full screen, so this switches the way of showing."
          value={form.required}
          onChange={(required) => setForm((current) => setRequired(current, required))}
        />
        <SwitchRow
          label="Can be closed"
          hint={form.required ? 'A required message can’t be closed.' : undefined}
          value={form.dismissible && !form.required}
          onChange={(dismissible) => update({ dismissible })}
          disabled={form.required}
        />
        <Field
          label="Shows"
          hint={form.required ? 'A required message ignores this and max shows.' : undefined}
          errors={errs('frequency')}
        >
          <ChipRow
            options={FREQUENCY_OPTIONS}
            value={form.frequency}
            onChange={(frequency) => update({ frequency })}
            trackPrefix="admin.messages.frequency"
            label="How often it shows"
          />
        </Field>
        {form.frequency === 'every_n_days' ? (
          <Field label="Days between shows" errors={errs('frequency')}>
            <TextField label="Days between shows" value={form.everyNDays} onChangeText={(everyNDays) => update({ everyNDays })} keyboardType="numeric" invalid={errs('frequency').length > 0} />
          </Field>
        ) : null}
        <Field label="Max shows per user (optional)" hint="Stops after this many times." errors={errs('maxShows')}>
          <TextField label="Max shows" value={form.maxShows} onChangeText={(maxShows) => update({ maxShows })} keyboardType="numeric" placeholder="No limit" invalid={errs('maxShows').length > 0} />
        </Field>
        <Field label="Priority" hint="When several messages are due, the highest goes first." errors={errs('priority')}>
          <TextField label="Priority" value={form.priority} onChangeText={(priority) => update({ priority })} keyboardType="numeric" invalid={errs('priority').length > 0} />
        </Field>
        <Field label="Delay in seconds (optional)" hint="Wait this long after the screen opens." errors={errs('delaySeconds')}>
          <TextField label="Delay in seconds" value={form.delaySeconds} onChangeText={(delaySeconds) => update({ delaySeconds })} keyboardType="numeric" placeholder="0" invalid={errs('delaySeconds').length > 0} />
        </Field>
        <Field label="Only on these screens (optional)" hint="One route per line. Empty means anywhere." errors={errs('screens')}>
          <View className="mb-2 flex-row flex-wrap gap-2">
            {SCREEN_SUGGESTIONS.map((screen) => {
              const active = splitScreens(form.screens).includes(screen);
              return (
                <Pressable
                  key={screen}
                  trackId="admin.messages.screens.toggle"
                  onPress={() => toggleScreen(screen)}
                  accessibilityRole="checkbox"
                  accessibilityLabel={screen}
                  accessibilityState={{ checked: active }}
                  className="rounded-full px-3 py-1.5"
                  style={{ backgroundColor: active ? colors.primary : colors.primarySoft }}
                >
                  <Text className="text-xs font-bold" style={{ color: active ? colors.onPrimary : colors.primary }}>
                    {screen}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          <TextField label="Screens" value={form.screens} onChangeText={(screens) => update({ screens })} multiline lines={3} placeholder="/(tabs)/hub" invalid={errs('screens').length > 0} />
        </Field>
      </Card>

      <Card title="When" hint={`Your local time (${timeZoneName()}), as YYYY-MM-DD HH:mm. Empty means no limit.`}>
        {(['startsAt', 'endsAt'] as const).map((key) => (
          <Field key={key} label={key === 'startsAt' ? 'Starts' : 'Ends'} errors={errs(key)}>
            <TextField label={key === 'startsAt' ? 'Start time' : 'End time'} value={form[key]} onChangeText={(text) => update({ [key]: text } as Partial<MessageForm>)} placeholder="2026-12-01 09:00" invalid={errs(key).length > 0} />
            <View className="mt-2 flex-row gap-2">
              <ActionButton label="Now" kind="soft" trackId={`admin.messages.${key}.now`} onPress={() => update({ [key]: formatLocalTime(new Date().toISOString()) } as Partial<MessageForm>)} />
              <ActionButton label="Clear" kind="soft" trackId={`admin.messages.${key}.clear`} onPress={() => update({ [key]: '' } as Partial<MessageForm>)} disabled={!form[key]} />
            </View>
          </Field>
        ))}
        <Text className="text-xs" style={{ color: colors.textSecondary }}>
          Nothing shows until the message is live. A live message with a start in the future shows as scheduled.
        </Text>
      </Card>

      <Card
        title="Who gets it"
        hint="Signed-in users only. Leave a box empty to not narrow by it. With everything empty it goes to everyone."
      >
        <Field label="Users (optional)" hint="User IDs or emails, separated by commas, spaces or new lines." errors={errs('targeting.userIds')}>
          <TextField label="Users" value={form.users} onChangeText={(users) => update({ users })} multiline lines={3} placeholder="person@example.com" invalid={errs('targeting.userIds').length > 0} />
        </Field>
        <Field label="Plan">
          <MultiChipRow options={[{ value: 'free', label: 'Free' }, { value: 'pro', label: 'Pro' }]} value={form.plans} onChange={(plans) => update({ plans })} trackPrefix="admin.messages.plan" label="Plan" />
        </Field>
        <Field label="Platform" errors={errs('targeting.platforms')}>
          <MultiChipRow options={[{ value: 'ios', label: 'iOS' }, { value: 'android', label: 'Android' }, { value: 'web', label: 'Web' }]} value={form.platforms} onChange={(platforms) => update({ platforms })} trackPrefix="admin.messages.platform" label="Platform" />
        </Field>
        <Field label="App language" errors={errs('targeting.languages')}>
          <MultiChipRow options={LANGUAGE_CHIPS} value={form.languages} onChange={(languages) => update({ languages })} trackPrefix="admin.messages.audience_language" label="App language" />
        </Field>
        <Field label="From version (optional)" hint="This version and above." errors={errs('targeting.minAppVersion')}>
          <TextField label="From version" value={form.minAppVersion} onChangeText={(minAppVersion) => update({ minAppVersion })} placeholder="1.4.0" invalid={errs('targeting.minAppVersion').length > 0} />
        </Field>
        <Field label="Below version (optional)" hint="Versions under this one. Use it for “update the app”." errors={errs('targeting.maxAppVersion')}>
          <TextField label="Below version" value={form.maxAppVersion} onChangeText={(maxAppVersion) => update({ maxAppVersion })} placeholder="1.5.0" invalid={errs('targeting.maxAppVersion').length > 0} />
        </Field>
      </Card>

      <Card>
        {showErrors && issues.length > 0 ? (
          <Text className="mb-3 text-sm font-semibold" style={{ color: colors.danger }} accessibilityRole="alert">
            {issues.length === 1 ? 'Fix 1 thing marked above.' : `Fix ${issues.length} things marked above.`}
          </Text>
        ) : null}
        {error ? (
          <Text className="mb-3 text-sm font-semibold" style={{ color: colors.danger }} accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        <View className="flex-row flex-wrap gap-2">
          <ActionButton label="Save" trackId="admin.messages.composer.save" onPress={() => void submit('save')} busy={busy === 'save'} disabled={busy !== null} />
          {!live ? (
            <ActionButton label="Save and go live" trackId="admin.messages.composer.save_live" onPress={() => void submit('live')} busy={busy === 'live'} disabled={busy !== null} />
          ) : null}
          <ActionButton label="Send to me only" kind="soft" trackId="admin.messages.composer.send_to_me" onPress={() => void submit('test')} busy={busy === 'test'} disabled={busy !== null} />
          <ActionButton label="Cancel" kind="soft" trackId="admin.messages.composer.cancel" onPress={onCancel} disabled={busy !== null} />
        </View>
        <Text className="mt-3 text-xs" style={{ color: colors.textSecondary }}>
          “Send to me only” saves a separate live copy that goes to your own account, with no start or end time, shown on every launch. Stop it from the list afterwards.
        </Text>
        {busy ? <ActivityIndicator className="mt-3" color={colors.primary} /> : null}
      </Card>
    </View>
  );

  return (
    <View className={isWide ? 'flex-row items-start gap-4' : ''}>
      {formColumn}
      {isWide ? (
        <View style={[{ width: 380 }, stickyPreview]}>
          <MessagePreview draft={previewDraft} />
        </View>
      ) : null}
    </View>
  );
}
