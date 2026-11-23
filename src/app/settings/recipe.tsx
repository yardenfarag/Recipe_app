import Ionicons from '@expo/vector-icons/Ionicons';
import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, View } from 'react-native';
import { logTap } from '@/lib/interactionLog';

import { ApplianceIcon } from '@/components/ApplianceIcon';
import { AvoidListEditor } from '@/components/AvoidListEditor';
import { FieldInput } from '@/components/text-input';
import { MeasurementToggle } from '@/components/MeasurementToggle';
import { UnitSystemToggle } from '@/components/UnitSystemToggle';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { IconButton } from '@/components/ui/IconButton';
import { Pressable } from '@/components/ui/Pressable';
import { Stepper } from '@/components/ui/Stepper';
import { Text } from '@/components/ui/Text';
import { Tile, TileLabel } from '@/components/ui/Tile';
import { HAIRLINE } from '@/components/ui/tokens';
import { useAuth } from '@/hooks/useAuth';
import { ownedAppliances, useOwnedAppliances } from '@/hooks/useOwnedAppliances';
import { useThemePreference } from '@/hooks/useThemePreference';
import {
  EMPTY_KITCHEN_PROFILE,
  addPantryStaple,
  loadGuestKitchenProfile,
  removePantryStaple,
  saveGuestKitchenProfile,
  type KitchenDietKey,
  type KitchenProfile,
  type KitchenSwap,
} from '@/lib/kitchenProfile';
import { avoidListIsEmpty } from '@shared/lib/avoidList';
import { fetchContributeToHub, setContributeToHub } from '@shared/lib/supabase/cookingHub';
import { fetchCloudKitchenProfile, saveCloudKitchenProfile } from '@/lib/supabase/kitchen';
import { RECIPE_VARIANTS } from '@shared/lib/recipeVariants';
import { announce } from '@/lib/a11y';
import { confirmAction } from '@/lib/confirmAction';
import { applianceNameKey } from '@shared/lib/applianceDisplay';
import type { ApplianceKey } from '@shared/lib/appliances';
import {
  APPLIANCE_CHECKLIST,
  specialOwnedCount,
  tickedAppliances,
  toggleAppliance,
} from '@shared/lib/ownedAppliances';

export default function RecipeSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { user } = useAuth();
  const [profile, setProfile] = useState<KitchenProfile>(EMPTY_KITCHEN_PROFILE);
  const [contributeToHub, setContributeToHubState] = useState(true);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [swapFrom, setSwapFrom] = useState('');
  const [swapTo, setSwapTo] = useState('');
  const [pantryDraft, setPantryDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const pendingRef = useRef<KitchenProfile | null>(null);
  const savingRef = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const next = user
        ? await fetchCloudKitchenProfile(user.id)
        : await loadGuestKitchenProfile();
      setProfile(next);
      if (user) {
        try {
          setContributeToHubState(await fetchContributeToHub(user.id));
        } catch {
          setContributeToHubState(true);
        }
      } else {
        setContributeToHubState(true);
      }
    } catch {
      setProfile(EMPTY_KITCHEN_PROFILE);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  async function persist(next: KitchenProfile) {
    setProfile(next);
    pendingRef.current = next;
    if (savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      while (pendingRef.current) {
        const toSave = pendingRef.current;
        pendingRef.current = null;
        if (user) await saveCloudKitchenProfile(user.id, toSave);
        else await saveGuestKitchenProfile(toSave);
      }
    } catch {
      setError(t('settings.kitchenSaveFailed'));
      announce(t('settings.kitchenSaveFailed'), { liveRegion: true });
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
    if (pendingRef.current) void persist(pendingRef.current);
  }

  function bumpServings(delta: number) {
    const current = profile.defaultServings;
    if (current == null) {
      if (delta < 0) return;
      void persist({ ...profile, defaultServings: 2 });
      return;
    }
    const next = current + delta;
    if (next < 1) {
      void persist({ ...profile, defaultServings: undefined });
      return;
    }
    void persist({ ...profile, defaultServings: Math.min(24, next) });
  }

  function toggleDiet(key: KitchenDietKey) {
    const diets = profile.diets.includes(key)
      ? profile.diets.filter((diet) => diet !== key)
      : [...profile.diets, key].slice(0, 4);
    void persist({ ...profile, diets });
  }

  function addSwap() {
    const from = swapFrom.trim();
    const to = swapTo.trim();
    if (!from || !to) return;
    const alwaysSwap: KitchenSwap[] = [...profile.alwaysSwap, { from, to }].slice(0, 8);
    setSwapFrom('');
    setSwapTo('');
    void persist({ ...profile, alwaysSwap });
  }

  function addPantry() {
    const next = addPantryStaple(profile, pantryDraft);
    if (next === profile) return;
    setPantryDraft('');
    void persist(next);
  }

  if (loading) {
    return (
      <SettingsDetailScreen>
        <ActivityIndicator color={colors.primary} accessibilityLabel={t('a11y.loading')} style={{ paddingVertical: 40 }} />
      </SettingsDetailScreen>
    );
  }

  return (
    <SettingsDetailScreen>
      <Section title={t('settings.measurements')} hint={t('settings.measurementsHint')}>
        <MeasurementToggle trackId="settings.kitchen.measurement" />
        <View style={{ gap: 4, marginTop: 10 }}>
          <Text variant="h3">{t('measurement.unitsTitle')}</Text>
          <Text variant="caption" tone="muted">
            {t('measurement.unitsHint')}
          </Text>
        </View>
        <UnitSystemToggle trackId="settings.kitchen.units" />
      </Section>

      <Section title={t('settings.kitchenHowICook')} hint={t('settings.kitchenHint')}>
        <TileLabel accessibilityRole="header" style={{ marginTop: 4 }}>
          {t('settings.kitchenDiets')}
        </TileLabel>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
          {RECIPE_VARIANTS.map((variant) => (
            <Chip
              key={variant.key}
              size="sm"
              trackId={`settings.kitchen.diet.${variant.key}`}
              selected={profile.diets.includes(variant.key as KitchenDietKey)}
              onPress={() => toggleDiet(variant.key as KitchenDietKey)}
            >
              {t(`recipe.variants.${variant.key}.label`)}
            </Chip>
          ))}
        </View>
      </Section>

      <Tile padding={20}>
        <AvoidListEditor profile={profile} onChange={(next) => void persist(next)} trackPrefix="settings.kitchen" />
      </Tile>

      {user ? (
        <Tile padding={20}>
          <MyAppliancesEditor />
        </Tile>
      ) : null}

      <Section title={t('settings.kitchenServings')} hint={t('settings.kitchenServingsHint')}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
          <Stepper
            label={t('settings.kitchenServings')}
            value={profile.defaultServings ?? 0}
            min={0}
            max={24}
            onChange={(next) => bumpServings(next - (profile.defaultServings ?? 0))}
            decreaseLabel={t('recipe.decreaseServings')}
            increaseLabel={t('recipe.increaseServings')}
            spokenValue={
              profile.defaultServings == null
                ? t('settings.kitchenServingsOff')
                : t('settings.kitchenPreviewServings', { count: profile.defaultServings })
            }
            trackId="settings.kitchen.servings"
          >
            <Text
              align="center"
              weight="bold"
              variant="bodySmall"
              tone={profile.defaultServings == null ? 'muted' : 'default'}
              style={{ fontVariant: ['tabular-nums'] }}
            >
              {profile.defaultServings ?? t('settings.kitchenServingsOff')}
            </Text>
          </Stepper>
          {profile.defaultServings != null ? (
            <Button
              trackId="settings.kitchen.servings.clear"
              variant="link"
              accessibilityLabel={t('a11y.clearDefaultServings')}
              onPress={() => void persist({ ...profile, defaultServings: undefined })}
            >
              {t('common.clear')}
            </Button>
          ) : null}
        </View>
      </Section>

      <Section title={t('settings.kitchenAlwaysSwap')}>
        {profile.alwaysSwap.length > 0 ? (
          <View>
            {profile.alwaysSwap.map((swap, index) => (
              <View
                key={`${swap.from}-${swap.to}-${index}`}
                style={[
                  { flexDirection: 'row', alignItems: 'center', gap: 8 },
                  index > 0 ? { borderTopWidth: HAIRLINE, borderColor: colors.border } : null,
                ]}
              >
                <Text
                  variant="bodySmall"
                  style={{ flex: 1 }}
                  accessibilityLabel={t('a11y.swapFromTo', { from: swap.from, to: swap.to })}
                >
                  {swap.from} → {swap.to}
                </Text>
                <IconButton
                  trackId="settings.kitchen.swap.remove"
                  icon="close"
                  iconSize={18}
                  label={t('a11y.removeSwap', { from: swap.from, to: swap.to })}
                  onPress={() =>
                    void persist({
                      ...profile,
                      alwaysSwap: profile.alwaysSwap.filter((_, i) => i !== index),
                    })
                  }
                />
              </View>
            ))}
          </View>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <FieldInput
            containerStyle={{ flex: 1 }}
            placeholder={t('settings.kitchenSwapFrom')}
            accessibilityLabel={t('settings.kitchenSwapFrom')}
            value={swapFrom}
            onChangeText={setSwapFrom}
          />
          <FieldInput
            containerStyle={{ flex: 1 }}
            placeholder={t('settings.kitchenSwapTo')}
            accessibilityLabel={t('settings.kitchenSwapTo')}
            value={swapTo}
            onChangeText={setSwapTo}
          />
        </View>
        <Button trackId="settings.kitchen.swap.add" variant="secondary" icon="add" onPress={addSwap}>
          {t('settings.kitchenAddSwap')}
        </Button>
      </Section>

      <Section title={t('settings.kitchenPantry')} hint={t('settings.kitchenPantryHint')}>
        {profile.pantryStaples.length === 0 ? (
          <Text variant="bodySmall" tone="muted">
            {t('settings.kitchenPantryEmpty')}
          </Text>
        ) : (
          <View>
            {profile.pantryStaples.map((staple, index) => (
              <View
                key={staple}
                style={[
                  { flexDirection: 'row', alignItems: 'center', gap: 8 },
                  index > 0 ? { borderTopWidth: HAIRLINE, borderColor: colors.border } : null,
                ]}
              >
                <Text variant="bodySmall" style={{ flex: 1 }}>
                  {staple}
                </Text>
                <IconButton
                  trackId="settings.kitchen.pantry.remove"
                  icon="close"
                  iconSize={18}
                  label={t('a11y.removeItem', { item: staple })}
                  onPress={() => void persist(removePantryStaple(profile, staple))}
                />
              </View>
            ))}
          </View>
        )}
        <FieldInput
          placeholder={t('settings.kitchenPantryPlaceholder')}
          accessibilityLabel={t('settings.kitchenPantryPlaceholder')}
          value={pantryDraft}
          onChangeText={setPantryDraft}
          onSubmitEditing={() => {
            logTap('settings.kitchen.pantry.submit');
            addPantry();
          }}
        />
        <Button trackId="settings.kitchen.pantry.add" variant="secondary" icon="add" onPress={addPantry}>
          {t('settings.kitchenPantryAdd')}
        </Button>
      </Section>

      {user ? (
        <Section title={t('hub.title')}>
          <SwitchRow
            trackId="settings.kitchen.contribute_to_hub.toggle"
            label={t('settings.contributeToHub')}
            hint={t('settings.contributeToHubHint')}
            value={contributeToHub}
            onToggle={() => {
              const next = !contributeToHub;
              setContributeToHubState(next);
              void setContributeToHub(user.id, next).catch(() => {
                setContributeToHubState(!next);
                setError(t('settings.kitchenSaveFailed'));
                announce(t('settings.kitchenSaveFailed'), { liveRegion: true });
              });
            }}
          />
        </Section>
      ) : null}

      <Section title={t('settings.kitchenAfterSnap')}>
        <SwitchRow
          trackId="settings.kitchen.auto_apply.toggle"
          label={t('settings.kitchenAutoApply')}
          hint={t('settings.kitchenAutoApplyHint')}
          value={profile.autoApplyOnExtract}
          onToggle={() => void persist({ ...profile, autoApplyOnExtract: !profile.autoApplyOnExtract })}
        />
        <View style={{ borderRadius: 16, padding: 14, backgroundColor: colors.backgroundElement }}>
          <Text variant="caption" tone="muted">
            {profile.diets.length === 0 &&
            profile.alwaysSwap.length === 0 &&
            profile.defaultServings == null &&
            avoidListIsEmpty(profile)
              ? t('settings.kitchenPreviewEmpty')
              : [
                  ...profile.allergies.map((allergen) => t(`avoid.allergens.${allergen}`)),
                  ...profile.otherAllergies,
                  ...profile.diets.map((diet) => t(`recipe.variants.${diet}.label`)),
                  ...profile.alwaysSwap.map((swap) => `${swap.from} → ${swap.to}`),
                  profile.defaultServings
                    ? t('settings.kitchenPreviewServings', { count: profile.defaultServings })
                    : null,
                  ...profile.dislikes,
                ]
                  .filter(Boolean)
                  .join(' · ')}
          </Text>
        </View>
      </Section>

      <View accessibilityLiveRegion="polite">
        {saving ? (
          <Text variant="caption" tone="muted">
            {t('web.settings.saving')}
          </Text>
        ) : null}
        {error ? (
          <Text variant="caption" tone="danger">
            {error}
          </Text>
        ) : null}
      </View>
    </SettingsDetailScreen>
  );
}

/** One part of the page: a tile with its heading (h3) and an optional muted line under it. */
function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Tile padding={20} style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text variant="h3">{title}</Text>
        {hint ? (
          <Text variant="caption" tone="muted">
            {hint}
          </Text>
        ) : null}
      </View>
      {children}
    </Tile>
  );
}

/** An on/off setting: its name and what it does, with a switch at the end. The whole row toggles it. */
function SwitchRow({
  label,
  hint,
  value,
  onToggle,
  trackId,
}: {
  label: string;
  hint: string;
  value: boolean;
  onToggle: () => void;
  trackId: string;
}) {
  const { colors } = useThemePreference();
  return (
    <Pressable
      trackId={trackId}
      onPress={onToggle}
      accessibilityRole="switch"
      accessibilityState={{ checked: value }}
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => ({
        flexDirection: 'row',
        alignItems: 'center',
        gap: 12,
        minHeight: 56,
        marginHorizontal: -8,
        paddingHorizontal: 8,
        paddingVertical: 8,
        borderRadius: 16,
        backgroundColor: pressed ? colors.backgroundElement : 'transparent',
      })}
    >
      <View style={{ flex: 1, minWidth: 0, gap: 4 }}>
        <Text variant="bodySmall" weight="semibold">
          {label}
        </Text>
        <Text variant="caption" tone="muted">
          {hint}
        </Text>
      </View>
      <View
        accessible={false}
        importantForAccessibility="no-hide-descendants"
        style={{
          width: 48,
          height: 28,
          borderRadius: 14,
          padding: 3,
          alignItems: value ? 'flex-end' : 'flex-start',
          backgroundColor: value ? colors.primary : colors.backgroundSelected,
        }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 11, backgroundColor: colors.surface }} />
      </View>
    </Pressable>
  );
}

/**
 * "My appliances" (PIN-155): tick what's in the kitchen, and recipes that need something else say so. Saved on the
 * account at every tap, so the web app shows the same list. Until the first tick the list is "not set" and recipes
 * check nothing, as before. The basics start ticked; "I have none of these" saves the list as it stands.
 */
function MyAppliancesEditor() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { kitchen, status, userId } = useOwnedAppliances();
  const ticked = tickedAppliances(kitchen);
  const count = specialOwnedCount(kitchen);

  // Opening Settings is when a list ticked on the web matters most: read the account again.
  useEffect(() => {
    ownedAppliances.refresh({ force: true });
  }, [userId]);

  useEffect(() => {
    if (status === 'failed') announce(t('settings.kitchenSaveFailed'), { liveRegion: true });
  }, [status, t]);

  async function stopChecking() {
    const ok = await confirmAction(
      t('myAppliances.clearTitle'),
      t('myAppliances.clearBody'),
      t('myAppliances.clearConfirm'),
      t('common.cancel'),
    );
    if (ok) ownedAppliances.clear();
  }

  return (
    <View testID="my-appliances" style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text variant="h3">{t('myAppliances.title')}</Text>
        <Text variant="caption" tone="muted">
          {t('myAppliances.hint')}
        </Text>
      </View>

      {kitchen ? (
        <View
          style={{ flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: 12 }}
          testID="my-appliances-status"
        >
          <View style={{ flex: 1, minWidth: 0, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Ionicons name="checkmark-circle" size={18} color={colors.success} />
            <Text variant="bodySmall" weight="semibold" style={{ flex: 1, minWidth: 0 }}>
              {t('myAppliances.checking', { count })}
            </Text>
          </View>
          <Button trackId="settings.appliances.clear" variant="link" onPress={() => void stopChecking()}>
            {t('myAppliances.stopChecking')}
          </Button>
        </View>
      ) : (
        <View
          style={{ gap: 12, borderRadius: 16, padding: 14, backgroundColor: colors.backgroundElement }}
          testID="my-appliances-status"
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
            <Ionicons name="information-circle-outline" size={18} color={colors.textSecondary} />
            <Text variant="caption" tone="muted" style={{ flex: 1, minWidth: 0 }}>
              {t('myAppliances.notSet')}
            </Text>
          </View>
          <Button
            trackId="settings.appliances.none"
            variant="secondary"
            size="sm"
            onPress={() => ownedAppliances.save([...ticked])}
          >
            {t('myAppliances.noneOfThese')}
          </Button>
        </View>
      )}

      {APPLIANCE_CHECKLIST.map((group) => (
        <View key={group.id} style={{ gap: 8, marginTop: 4 }}>
          <TileLabel accessibilityRole="header">
            {/* "myAppliances.groups" is one dotted key in the catalog; ">" splits the path at the right place. */}
            {t(`myAppliances.groups>${group.id}`, { keySeparator: '>' })}
          </TileLabel>
          {group.id === 'basics' ? (
            <Text variant="caption" tone="muted">
              {t('myAppliances.basicsHint')}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
            {group.keys.map((key) => (
              <ApplianceToggle
                key={key}
                appliance={key}
                checked={ticked.has(key)}
                onToggle={() => ownedAppliances.save(toggleAppliance(kitchen, key))}
              />
            ))}
          </View>
        </View>
      ))}

      {status === 'failed' ? (
        <Text variant="caption" tone="danger" accessibilityLiveRegion="polite">
          {t('settings.kitchenSaveFailed')}
        </Text>
      ) : null}
    </View>
  );
}

/** One appliance, on or off: a chip with its icon, filled once it's in the kitchen. */
function ApplianceToggle({
  appliance,
  checked,
  onToggle,
}: {
  appliance: ApplianceKey;
  checked: boolean;
  onToggle: () => void;
}) {
  const { t } = useTranslation();
  const name = t(applianceNameKey(appliance));
  return (
    <Chip
      trackId={`settings.appliances.toggle.${appliance}`}
      testID={`my-appliance-${appliance}`}
      size="sm"
      selected={checked}
      accessibilityLabel={name}
      icon={({ color, size }) => <ApplianceIcon appliance={appliance} size={size} color={color} />}
      onPress={onToggle}
    >
      {name}
    </Chip>
  );
}
