import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, ScrollView, View } from 'react-native';

import { HouseholdAvatar, MemberAvatar, MemberStack } from '@/components/household/HouseholdAvatar';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Text } from '@/components/ui/Text';
import { Tile } from '@/components/ui/Tile';
import { KitIcon, Radii, type IconName } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { useHousehold } from '@/hooks/useHousehold';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import { isShared, suggestDisplayName } from '@shared/lib/household';
import {
  acceptHouseholdInvite,
  HouseholdError,
  inviteTokenFrom,
  previewHouseholdInvite,
} from '@shared/lib/supabase/household';
import { showToast } from '@shared/lib/toast';
import {
  HOUSEHOLD_DISPLAY_NAME_MAX,
  HOUSEHOLD_MAX_MEMBERS,
  type InvitePreview,
  type InvitePreviewStatus,
} from '@shared/types/household';

type Problem = Exclude<InvitePreviewStatus, 'ok'>;

const PROBLEM_FOR_ERROR: Partial<Record<string, Problem>> = {
  invite_expired: 'expired',
  invite_not_found: 'not_found',
  household_full: 'full',
  already_member: 'already_member',
};

/**
 * Join a household from an invite link (docs/adr/034-households.md): https://pinch-app.io/app/join/<token> opens
 * here in the app (src/lib/appLinks.ts). It shows whose household it is first, signed in or not. Signed out: sign up
 * or sign in, and come back here (`returnTo`). Signed in: your name and Join; leaving a household with other people
 * in it says so ("Leave and join"). A household of one just folds into the new one. Then on to the list.
 */
export default function JoinHouseholdScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { token: tokenParam } = useLocalSearchParams<{ token: string }>();
  const raw = Array.isArray(tokenParam) ? tokenParam[0] : tokenParam;
  const token = useMemo(() => (raw ? inviteTokenFrom(raw) : null), [raw]);
  const { user, loading: authLoading } = useAuth();
  const userId = user?.id ?? null;
  const { household, apply } = useHousehold();

  const [preview, setPreview] = useState<InvitePreview | null>(null);
  const [problem, setProblem] = useState<Problem | null>(token ? null : 'not_found');
  const [loadFailed, setLoadFailed] = useState(false);
  const [loading, setLoading] = useState(Boolean(token));
  const [displayName, setDisplayName] = useState('');
  const [typed, setTyped] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    setLoadFailed(false);
    try {
      const next = await previewHouseholdInvite(token);
      setPreview(next);
      setProblem(next.status === 'ok' ? null : next.status);
    } catch {
      setLoadFailed(true);
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Again after signing in: a signed-in preview says more (who is in it, what I'd leave).
  useEffect(() => {
    if (authLoading) return;
    void load();
  }, [authLoading, load, userId]);

  // A first guess at my name: what my household calls me now, else the account's own name.
  const suggested = useMemo(() => {
    const me = household?.members.find((member) => member.isMe);
    if (me?.displayName && isShared(household)) return me.displayName;
    const meta = (user?.user_metadata ?? {}) as { full_name?: unknown; name?: unknown };
    const fullName =
      typeof meta.full_name === 'string' ? meta.full_name : typeof meta.name === 'string' ? meta.name : null;
    return me?.displayName || suggestDisplayName({ fullName, email: user?.email ?? null });
  }, [household, user?.email, user?.user_metadata]);

  useEffect(() => {
    if (!typed) setDisplayName(suggested);
  }, [suggested, typed]);

  function signIn(mode: 'signup' | 'signin') {
    if (!token) return;
    router.push({
      pathname: '/auth',
      params: { mode, reason: 'household_invite', returnTo: `/join/${token}` },
    });
  }

  async function join() {
    if (!token || joining) return;
    const name = displayName.trim();
    if (!name) {
      setNameError(t('household.setup.yourNameRequired'));
      announce(t('household.setup.yourNameRequired'));
      return;
    }
    setJoining(true);
    try {
      const next = await acceptHouseholdInvite(token, name);
      apply(next);
      const joinedName = next.name ?? preview?.householdName ?? '';
      showToast(t('household.join.joined', { name: joinedName }));
      announce(t('household.join.joined', { name: joinedName }));
      router.dismissTo('/list');
    } catch (err) {
      const code = err instanceof HouseholdError ? err.code : 'unknown';
      const mapped = PROBLEM_FOR_ERROR[code];
      if (mapped) setProblem(mapped);
      else if (code === 'name_required') setNameError(t('household.setup.yourNameRequired'));
      else showToast(t('household.saveError'), 'error');
    } finally {
      setJoining(false);
    }
  }

  if (authLoading || (loading && !preview)) {
    return (
      <Screen edges={['bottom']}>
        <View
          style={{ flex: 1, alignItems: 'center', justifyContent: 'center', gap: 12, paddingHorizontal: 24 }}
          accessibilityLiveRegion="polite"
        >
          <ActivityIndicator color={colors.primary} />
          <Text variant="bodySmall" tone="muted" align="center">
            {t('a11y.loading')}
          </Text>
        </View>
      </Screen>
    );
  }

  const name = preview?.householdName ?? '';
  const openList = () => router.dismissTo('/list');

  if (problem) {
    const states: Record<Problem, { icon: IconName; title: string; body?: string }> = {
      expired: {
        icon: 'time-outline',
        title: t('household.join.expiredTitle'),
        body: t('household.join.expiredBody'),
      },
      full: {
        icon: 'people-outline',
        title: t('household.join.fullTitle'),
        body: t('household.join.fullBody', { count: HOUSEHOLD_MAX_MEMBERS }),
      },
      not_found: {
        icon: 'unlink-outline',
        title: t('household.join.notFoundTitle'),
        body: t('household.join.notFoundBody'),
      },
      already_member: {
        icon: 'checkmark-circle-outline',
        title: t('household.join.alreadyMemberTitle', { name }),
      },
    };
    const state = states[problem];
    return (
      <JoinPage>
        <StateTile
          icon={state.icon}
          title={state.title}
          body={state.body}
          action={
            user ? (
              <Button
                trackId={`household.join.${problem}.open_list`}
                size="lg"
                fullWidth
                icon="cart-outline"
                onPress={openList}
              >
                {t('household.join.openList')}
              </Button>
            ) : (
              <Button
                trackId={`household.join.${problem}.home`}
                variant="outline"
                size="lg"
                fullWidth
                onPress={() => router.dismissTo('/')}
              >
                {t('recipe.goToLibrary')}
              </Button>
            )
          }
        />
      </JoinPage>
    );
  }

  if (loadFailed || !preview) {
    return (
      <JoinPage>
        <StateTile
          icon="cloud-offline-outline"
          title={t('household.join.loadError')}
          action={
            <Button trackId="household.join.retry" icon="refresh" size="lg" fullWidth onPress={() => void load()}>
              {t('common.tryAgainAction')}
            </Button>
          }
        />
      </JoinPage>
    );
  }

  const leaving = preview.leaving;

  return (
    <JoinPage>
      <Tile padding={24} style={{ alignItems: 'center', gap: 14 }}>
        <HouseholdAvatar value={preview.householdAvatar} size={96} />
        <Text variant="h2" align="center">
          {t('household.join.title', { name })}
        </Text>
        {preview.invitedBy ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, maxWidth: '100%' }}>
            <MemberAvatar member={preview.invitedBy} size={24} />
            <Text variant="bodySmall" tone="muted" style={{ flexShrink: 1 }}>
              {t('household.join.invitedBy', { name: preview.invitedBy.displayName })}
            </Text>
          </View>
        ) : null}
        {preview.memberCount > 0 ? (
          <View
            accessible
            accessibilityLabel={t('household.join.members', { count: preview.memberCount })}
            style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}
          >
            {preview.members.length > 0 ? <MemberStack members={preview.members} size={30} max={5} /> : null}
            <Text variant="caption" tone="muted">
              {t('household.join.members', { count: preview.memberCount })}
            </Text>
          </View>
        ) : null}
      </Tile>

      {!user ? (
        <Tile padding={20} style={{ gap: 14 }}>
          <Text variant="bodySmall" tone="muted">
            {t('household.join.signedOut')}
          </Text>
          <Button trackId="household.join.sign_up" size="lg" fullWidth onPress={() => signIn('signup')}>
            {t('household.join.signUp')}
          </Button>
          <Button
            trackId="household.join.sign_in"
            variant="outline"
            size="lg"
            fullWidth
            onPress={() => signIn('signin')}
          >
            {t('household.join.signIn')}
          </Button>
        </Tile>
      ) : (
        <Tile padding={20} style={{ gap: 16 }}>
          {leaving ? (
            <View
              accessibilityLiveRegion="polite"
              style={{
                flexDirection: 'row',
                gap: 10,
                borderRadius: Radii.inner,
                padding: 14,
                backgroundColor: colors.warningSoft,
              }}
            >
              <KitIcon icon="alert-circle-outline" size={20} color={colors.warning} />
              <Text variant="bodySmall" color={colors.warning} style={{ flex: 1, minWidth: 0 }}>
                {t('household.join.leaveWarning', { name: leaving.name })}
              </Text>
            </View>
          ) : (
            <Text variant="bodySmall" tone="muted">
              {t('household.join.whatHappens')}
            </Text>
          )}
          <TextField
            label={t('household.join.yourNameLabel')}
            hint={t('household.join.yourNameHint')}
            value={displayName}
            onChangeText={(value) => {
              setTyped(true);
              setDisplayName(value);
              if (nameError) setNameError(null);
            }}
            maxLength={HOUSEHOLD_DISPLAY_NAME_MAX}
            autoCapitalize="words"
            returnKeyType="done"
            onSubmitEditing={() => void join()}
            error={nameError}
            editable={!joining}
          />
          <Button
            trackId={leaving ? 'household.join.leave_and_join' : 'household.join.join'}
            variant={leaving ? 'danger' : 'primary'}
            size="lg"
            fullWidth
            busy={joining}
            onPress={() => void join()}
          >
            {joining ? t('household.join.joining') : leaving ? t('household.join.leaveAndJoin') : t('household.join.join')}
          </Button>
        </Tile>
      )}
    </JoinPage>
  );
}

function JoinPage({ children }: { children: ReactNode }) {
  return (
    <Screen edges={['bottom']}>
      <ScrollView
        style={{ flex: 1 }}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 24 }}
      >
        <View style={{ width: '100%', maxWidth: 520, alignSelf: 'center', gap: 16 }}>{children}</View>
      </ScrollView>
    </Screen>
  );
}

function StateTile({
  icon,
  title,
  body,
  action,
}: {
  icon: IconName;
  title: string;
  body?: string;
  action: ReactNode;
}) {
  const { colors } = useThemePreference();
  return (
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
          backgroundColor: colors.backgroundElement,
        }}
      >
        <KitIcon icon={icon} size={26} color={colors.textSecondary} />
      </View>
      <Text variant="h2" align="center" accessibilityLiveRegion="polite">
        {title}
      </Text>
      {body ? (
        <Text variant="bodySmall" tone="muted" align="center">
          {body}
        </Text>
      ) : null}
      <View style={{ alignSelf: 'stretch', marginTop: 4 }}>{action}</View>
    </Tile>
  );
}
