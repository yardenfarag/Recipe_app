import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';

import { HouseholdAvatar, MemberAvatar } from '@/components/household/HouseholdAvatar';
import { HouseholdAvatarPicker } from '@/components/household/HouseholdAvatarPicker';
import { HouseholdEditSheet } from '@/components/household/HouseholdEditSheet';
import { HouseholdShares, InvitePasteTile } from '@/components/household/HouseholdParts';
import { InviteSheet } from '@/components/household/InviteSheet';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { SettingsGroup, SettingsRow } from '@/components/SettingsMenu';
import { TextField } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { Text } from '@/components/ui/Text';
import { Tile, TileBadge, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE, KitIcon } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useHousehold } from '@/hooks/useHousehold';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { askConfirm } from '@/lib/dialog';
import { markHouseholdRowSeen } from '@/lib/householdDiscovery';
import { formatShortDate, joinNames } from '@/lib/householdHelpers';
import { isHouseholdFull, isShared, otherMembers, suggestDisplayName } from '@shared/lib/household';
import { householdAvatarValue, suggestHouseholdAvatar, type HouseholdAvatarId } from '@shared/lib/householdAvatars';
import {
  HouseholdError,
  leaveHousehold,
  removeHouseholdMember,
  setMyDisplayName,
  setUpHousehold,
} from '@shared/lib/supabase/household';
import { showToast } from '@shared/lib/toast';
import {
  HOUSEHOLD_DISPLAY_NAME_MAX,
  HOUSEHOLD_MAX_MEMBERS,
  HOUSEHOLD_NAME_MAX,
  type Household,
  type HouseholdMember,
} from '@shared/types/household';

/**
 * Settings → Household (docs/adr/034-households.md): the people you live with share one shopping list, one pantry and
 * one "Always have" list. Until it is set up, this is the set-up form (name, picture, your name) and, after Create,
 * the invite sheet. Once set up: the household's picture and name (Edit), the people in it (Remove), Invite, your
 * name in it, and Leave. "Have an invite?" takes a pasted link to the join screen either way. Account only.
 */
export default function HouseholdScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { user, loading: authLoading } = useAuth();
  const { household, status, refresh } = useHousehold();
  const [invite, setInvite] = useState<{ open: boolean; afterCreate: boolean }>({ open: false, afterCreate: false });

  // The "New" badge on the settings row goes once the screen was seen.
  useEffect(() => {
    void markHouseholdRowSeen();
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (user) void refresh({ maxAgeMs: 3_000 });
    }, [refresh, user]),
  );

  if (!authLoading && !user) {
    return (
      <SettingsDetailScreen>
        <Tile padding={24} style={{ alignItems: 'center', gap: 14 }}>
          <HouseholdAvatar value={null} size={64} />
          <Text variant="h3" align="center">
            {t('household.title')}
          </Text>
          <Text variant="bodySmall" tone="muted" align="center">
            {t('household.settingsHint')}
          </Text>
          <Button
            trackId="household.sign_in"
            fullWidth
            onPress={() => router.push('/auth?mode=signin&reason=sync')}
          >
            {t('settings.signIn')}
          </Button>
        </Tile>
      </SettingsDetailScreen>
    );
  }

  if (authLoading || (!household && status !== 'failed')) {
    return (
      <SettingsDetailScreen>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} style={{ paddingVertical: 40 }} />
      </SettingsDetailScreen>
    );
  }

  if (!household) {
    return (
      <SettingsDetailScreen>
        <Tile padding={20} style={{ gap: 12 }}>
          <Text variant="bodySmall" tone="danger" accessibilityLiveRegion="polite">
            {t('household.loadError')}
          </Text>
          <Button trackId="household.retry" variant="secondary" icon="refresh" onPress={() => void refresh()}>
            {t('common.tryAgainAction')}
          </Button>
        </Tile>
      </SettingsDetailScreen>
    );
  }

  return (
    <SettingsDetailScreen>
      {household.isSetUp ? (
        <ManageHousehold household={household} onInvite={() => setInvite({ open: true, afterCreate: false })} />
      ) : (
        <SetUpHousehold household={household} onCreated={() => setInvite({ open: true, afterCreate: true })} />
      )}
      <InvitePasteTile />
      {household.isSetUp ? (
        <InviteSheet
          visible={invite.open}
          afterCreate={invite.afterCreate}
          household={household}
          onClose={() => setInvite({ open: false, afterCreate: false })}
        />
      ) : null}
    </SettingsDetailScreen>
  );
}

/** The account's own name, for a first guess at the name the household sees. */
function useSuggestedName(): string {
  const { user } = useAuth();
  return useMemo(() => {
    const meta = (user?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
    const fullName =
      typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;
    return suggestDisplayName({ fullName, email: user?.email ?? null });
  }, [user?.email, user?.user_metadata]);
}

function SetUpHousehold({ household, onCreated }: { household: Household; onCreated: () => void }) {
  const { t } = useTranslation();
  const { apply } = useHousehold();
  const suggested = useSuggestedName();
  const [name, setName] = useState('');
  const [avatar, setAvatar] = useState<HouseholdAvatarId>(() => suggestHouseholdAvatar(household.id));
  const [displayName, setDisplayName] = useState(suggested);
  const [touchedName, setTouchedName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [yourNameError, setYourNameError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // The account's name can arrive after the first render; don't overwrite what was typed.
  useEffect(() => {
    if (!touchedName && suggested) setDisplayName(suggested);
  }, [suggested, touchedName]);

  async function create() {
    if (creating) return;
    const trimmed = name.trim();
    const me = displayName.trim();
    const nextNameError = trimmed ? null : t('household.setup.nameRequired');
    const nextYourNameError = me ? null : t('household.setup.yourNameRequired');
    setNameError(nextNameError);
    setYourNameError(nextYourNameError);
    if (nextNameError || nextYourNameError) {
      announce((nextNameError ?? nextYourNameError) as string);
      return;
    }
    setCreating(true);
    try {
      const next = await setUpHousehold({ name: trimmed, avatar: householdAvatarValue(avatar), displayName: me });
      apply(next);
      showToast(t('household.setup.created', { name: next.name ?? trimmed }));
      onCreated();
    } catch (err) {
      if (err instanceof HouseholdError && err.code === 'name_required') {
        setNameError(t('household.setup.nameRequired'));
      } else {
        showToast(t('household.saveError'), 'error');
      }
    } finally {
      setCreating(false);
    }
  }

  return (
    <>
      <Tile padding={24} style={{ gap: 16 }}>
        <View style={{ alignItems: 'center', gap: 14 }}>
          <HouseholdAvatar value={householdAvatarValue(avatar)} size={88} />
          <Text variant="h2" align="center">
            {t('household.setup.title')}
          </Text>
          <Text variant="bodySmall" tone="muted" align="center">
            {t('household.setup.intro')}
          </Text>
        </View>
        <HouseholdShares />
      </Tile>

      <Tile padding={20} style={{ gap: 20 }}>
        <TextField
          label={t('household.setup.nameLabel')}
          placeholder={t('household.setup.namePlaceholder')}
          value={name}
          onChangeText={(value) => {
            setName(value);
            if (nameError) setNameError(null);
          }}
          maxLength={HOUSEHOLD_NAME_MAX}
          autoCapitalize="words"
          returnKeyType="next"
          error={nameError}
          editable={!creating}
        />
        <HouseholdAvatarPicker value={avatar} onChange={setAvatar} disabled={creating} />
        <TextField
          label={t('household.setup.yourNameLabel')}
          hint={t('household.setup.yourNameHint')}
          value={displayName}
          onChangeText={(value) => {
            setTouchedName(true);
            setDisplayName(value);
            if (yourNameError) setYourNameError(null);
          }}
          maxLength={HOUSEHOLD_DISPLAY_NAME_MAX}
          autoCapitalize="words"
          autoComplete="given-name"
          textContentType="givenName"
          returnKeyType="done"
          onSubmitEditing={() => void create()}
          error={yourNameError}
          editable={!creating}
        />
        <Button trackId="household.setup.create" size="lg" fullWidth busy={creating} onPress={() => void create()}>
          {creating ? t('household.setup.creating') : t('household.setup.create')}
        </Button>
      </Tile>
    </>
  );
}

function ManageHousehold({ household, onInvite }: { household: Household; onInvite: () => void }) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { language } = useLanguagePreference();
  const { apply } = useHousehold();
  const [editOpen, setEditOpen] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const shared = isShared(household);
  const full = isHouseholdFull(household);
  const name = household.name ?? '';
  const others = otherMembers(household);

  async function remove(member: HouseholdMember) {
    if (removing) return;
    const ok = await askConfirm({
      trackId: 'household.remove_dialog',
      title: t('household.manage.removeTitle', { name: member.displayName }),
      message: t('household.manage.removeBody'),
      confirmLabel: t('household.manage.removeConfirm'),
      destructive: true,
    });
    if (!ok) return;
    setRemoving(member.userId);
    try {
      apply(await removeHouseholdMember(member.userId));
      showToast(t('household.manage.removed', { name: member.displayName }));
      announce(t('household.manage.removed', { name: member.displayName }));
    } catch {
      showToast(t('household.saveError'), 'error');
    } finally {
      setRemoving(null);
    }
  }

  async function leave() {
    if (leaving) return;
    const ok = await askConfirm({
      trackId: 'household.leave_dialog',
      title: t('household.manage.leaveTitle', { name }),
      message: t('household.manage.leaveBody'),
      confirmLabel: t('household.manage.leaveConfirm'),
      destructive: true,
    });
    if (!ok) return;
    setLeaving(true);
    try {
      apply(await leaveHousehold());
      showToast(t('household.manage.left', { name }));
      announce(t('household.manage.left', { name }));
    } catch {
      showToast(t('household.saveError'), 'error');
    } finally {
      setLeaving(false);
    }
  }

  return (
    <>
      {/* The household: its picture, name and how many live in it. */}
      <Tile padding={20} style={{ gap: 16 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
          <HouseholdAvatar value={household.avatar} size={80} />
          <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
            <Text variant="h2" numberOfLines={2}>
              {name}
            </Text>
            <Text variant="caption" tone="muted">
              {t('household.join.members', { count: household.members.length })}
            </Text>
          </View>
          {/* An icon, so a long name keeps the width (the sheet it opens says "Edit household"). */}
          <IconButton
            trackId="household.edit"
            variant="tile"
            icon="pencil-outline"
            iconSize={20}
            label={t('household.manage.editTitle')}
            onPress={() => setEditOpen(true)}
            style={{ alignSelf: 'flex-start' }}
          />
        </View>
        {shared ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <KitIcon icon="sync-outline" size={16} color={colors.textSecondary} />
            <Text variant="caption" tone="muted" style={{ flex: 1, minWidth: 0 }}>
              {t('household.live', { names: joinNames(others.map((m) => m.displayName), language) })}
            </Text>
          </View>
        ) : null}
      </Tile>

      {shared ? (
        <View style={{ gap: 10 }}>
          <View style={{ paddingHorizontal: 4 }}>
            <TileLabel accessibilityRole="header">{t('household.manage.members')}</TileLabel>
          </View>
          <Tile style={{ paddingHorizontal: 12, paddingVertical: 4 }}>
            {household.members.map((member, index) => (
              <View key={member.userId}>
                {index > 0 ? (
                  <View
                    accessible={false}
                    importantForAccessibility="no"
                    style={{ height: HAIRLINE, backgroundColor: colors.border, marginStart: 56 }}
                  />
                ) : null}
                <MemberRow
                  member={member}
                  joined={formatShortDate(member.joinedAt, language)}
                  busy={removing === member.userId}
                  disabled={removing != null || leaving}
                  onRemove={() => void remove(member)}
                />
              </View>
            ))}
            <View style={{ paddingVertical: 12, gap: 8 }}>
              {full ? (
                <Text variant="caption" tone="muted">
                  {t('household.invite.full', { count: HOUSEHOLD_MAX_MEMBERS })}
                </Text>
              ) : (
                <Button
                  trackId="household.invite"
                  variant="secondary"
                  icon="person-add-outline"
                  fullWidth
                  onPress={onInvite}
                >
                  {t('household.manage.invite')}
                </Button>
              )}
            </View>
          </Tile>
        </View>
      ) : (
        <Tile padding={24} style={{ alignItems: 'center', gap: 12 }}>
          <View
            accessible={false}
            importantForAccessibility="no-hide-descendants"
            style={{
              width: 56,
              height: 56,
              borderRadius: 16,
              alignItems: 'center',
              justifyContent: 'center',
              backgroundColor: colors.primarySoft,
            }}
          >
            <KitIcon icon="people-outline" size={26} color={colors.primaryText} />
          </View>
          <Text variant="h3" align="center">
            {t('household.manage.onlyYou')}
          </Text>
          <Text variant="bodySmall" tone="muted" align="center">
            {t('household.manage.onlyYouBody')}
          </Text>
          <Button trackId="household.invite_first" size="lg" fullWidth icon="person-add-outline" onPress={onInvite}>
            {t('household.manage.invite')}
          </Button>
        </Tile>
      )}

      <MyNameTile household={household} />

      <Tile padding={20}>
        <HouseholdShares />
      </Tile>

      {shared ? (
        <SettingsGroup danger>
          <SettingsRow
            trackId="household.leave"
            label={t('household.manage.leave')}
            icon="exit-outline"
            destructive
            chevron={false}
            busy={leaving}
            disabled={leaving || removing != null}
            onPress={() => void leave()}
          />
        </SettingsGroup>
      ) : null}

      <HouseholdEditSheet visible={editOpen} onClose={() => setEditOpen(false)} household={household} />
    </>
  );
}

function MemberRow({
  member,
  joined,
  busy,
  disabled,
  onRemove,
}: {
  member: HouseholdMember;
  joined: string;
  busy: boolean;
  disabled: boolean;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const joinedLine = joined ? t('household.manage.joined', { date: joined }) : '';
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12, minHeight: 64, paddingVertical: 8 }}>
      <View
        accessible
        accessibilityLabel={[member.displayName, member.isMe ? t('household.manage.you') : null, joinedLine]
          .filter(Boolean)
          .join(', ')}
        style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 12 }}
      >
        <MemberAvatar member={member} size={44} />
        <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Text variant="bodySmall" weight="semibold" numberOfLines={1} style={{ flexShrink: 1 }}>
              {member.displayName}
            </Text>
            {member.isMe ? <TileBadge>{t('household.manage.you')}</TileBadge> : null}
          </View>
          {joinedLine ? (
            <Text variant="caption" tone="muted">
              {joinedLine}
            </Text>
          ) : null}
        </View>
      </View>
      {member.isMe ? null : busy ? (
        <View style={{ width: 44, height: 44, alignItems: 'center', justifyContent: 'center' }}>
          <ActivityIndicator size="small" color={colors.textSecondary} accessibilityLabel={t('a11y.loading')} />
        </View>
      ) : (
        <IconButton
          trackId="household.member.remove"
          icon="person-remove-outline"
          iconSize={20}
          label={t('household.manage.removeLabel', { name: member.displayName })}
          disabled={disabled}
          onPress={onRemove}
        />
      )}
    </View>
  );
}

/** The name the others see for me, with Save once it changed. */
function MyNameTile({ household }: { household: Household }) {
  const { t } = useTranslation();
  const { apply } = useHousehold();
  const me = household.members.find((member) => member.isMe);
  const saved = me?.displayName ?? '';
  const [value, setValue] = useState(saved);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Follow the saved name (another phone of mine changed it) unless something is being typed.
  useEffect(() => {
    if (!dirty) setValue(saved);
  }, [dirty, saved]);

  const changed = value.trim() !== saved;

  async function save() {
    if (saving) return;
    const trimmed = value.trim();
    if (!trimmed) {
      setError(t('household.setup.yourNameRequired'));
      announce(t('household.setup.yourNameRequired'));
      return;
    }
    setSaving(true);
    try {
      apply(await setMyDisplayName(trimmed));
      setDirty(false);
      showToast(t('household.manage.saved'));
    } catch {
      showToast(t('household.saveError'), 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <Tile padding={20} style={{ gap: 12 }}>
      <TextField
        label={t('household.manage.yourName')}
        hint={t('household.setup.yourNameHint')}
        value={value}
        onChangeText={(next) => {
          setValue(next);
          setDirty(true);
          if (error) setError(null);
        }}
        maxLength={HOUSEHOLD_DISPLAY_NAME_MAX}
        autoCapitalize="words"
        returnKeyType="done"
        onSubmitEditing={() => changed && void save()}
        error={error}
        editable={!saving}
      />
      {changed ? (
        <Button trackId="household.my_name.save" variant="secondary" busy={saving} onPress={() => void save()}>
          {saving ? t('household.manage.saving') : t('household.manage.save')}
        </Button>
      ) : null}
    </Tile>
  );
}
