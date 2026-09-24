import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, Text, View } from 'react-native';

import { MeasurementToggle } from '@/components/MeasurementToggle';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { TextInput } from '@/components/text-input';
import { useAuth } from '@/hooks/useAuth';
import { useRtl } from '@/hooks/useRtl';
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
import { fetchContributeToHub, setContributeToHub } from '@/lib/supabase/cookingHub';
import { fetchCloudKitchenProfile, saveCloudKitchenProfile } from '@/lib/supabase/kitchen';
import { RECIPE_VARIANTS } from '@/lib/recipeVariants';

export default function RecipeSettingsScreen() {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign } = useRtl();
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
        <ActivityIndicator color={colors.primary} />
      </SettingsDetailScreen>
    );
  }

  return (
    <SettingsDetailScreen>
      <Text className="mb-3 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.measurements')}
      </Text>
      <MeasurementToggle />
      <Text className="mt-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
        {t('settings.measurementsHint')}
      </Text>

      <Text className="mb-2 mt-8 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.kitchenHowICook')}
      </Text>
      <Text className="mb-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
        {t('settings.kitchenHint')}
      </Text>

      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
        {t('settings.kitchenDiets')}
      </Text>
      <View className="mb-4 flex-row flex-wrap gap-2">
        {RECIPE_VARIANTS.map((variant) => {
          const active = profile.diets.includes(variant.key as KitchenDietKey);
          return (
            <Pressable
              key={variant.key}
              onPress={() => toggleDiet(variant.key as KitchenDietKey)}
              className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
              style={{ backgroundColor: active ? colors.primary : colors.frosted }}
              accessibilityRole="button"
              accessibilityState={{ selected: active }}
            >
              <Text className="text-sm font-semibold" style={{ color: active ? '#fff' : colors.text }}>
                {t(`recipe.variants.${variant.key}.label`)}
              </Text>
            </Pressable>
          );
        })}
      </View>

      <Text className="mb-2 text-xs font-semibold uppercase tracking-wide" style={{ color: colors.textSecondary }}>
        {t('settings.kitchenServings')}
      </Text>
      <View className="mb-2 flex-row items-center gap-3">
        <Pressable
          onPress={() => bumpServings(-1)}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: colors.frosted }}
          accessibilityLabel={t('recipe.decreaseServings')}
        >
          <Text className="text-lg font-bold" style={{ color: colors.text }}>−</Text>
        </Pressable>
        <Text className="min-w-[28px] text-center text-base font-semibold" style={{ color: colors.text }}>
          {profile.defaultServings ?? t('settings.kitchenServingsOff')}
        </Text>
        <Pressable
          onPress={() => bumpServings(1)}
          className="h-11 w-11 items-center justify-center rounded-full active:opacity-80"
          style={{ backgroundColor: colors.frosted }}
          accessibilityLabel={t('recipe.increaseServings')}
        >
          <Text className="text-lg font-bold" style={{ color: colors.text }}>+</Text>
        </Pressable>
        {profile.defaultServings != null ? (
          <Pressable onPress={() => void persist({ ...profile, defaultServings: undefined })}>
            <Text className="text-xs font-semibold" style={{ color: colors.primary }}>
              {t('common.clear')}
            </Text>
          </Pressable>
        ) : null}
      </View>
      <Text className="mb-2 text-xs leading-5" style={{ color: colors.textSecondary }}>
        {t('settings.kitchenServingsHint')}
      </Text>

      <View className="my-6 h-px" style={{ backgroundColor: colors.border }} />

      <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.kitchenAlwaysSwap')}
      </Text>
      {profile.alwaysSwap.map((swap, index) => (
        <View key={`${swap.from}-${swap.to}-${index}`} className="mb-2 flex-row items-center gap-2">
          <Text className="flex-1 text-sm" style={{ color: colors.text }}>
            {swap.from} → {swap.to}
          </Text>
          <Pressable
            onPress={() =>
              void persist({
                ...profile,
                alwaysSwap: profile.alwaysSwap.filter((_, i) => i !== index),
              })
            }
            accessibilityLabel={t('common.remove')}
          >
            <Text className="text-xs font-semibold" style={{ color: colors.danger }}>
              {t('common.remove')}
            </Text>
          </Pressable>
        </View>
      ))}
      <View className="mb-3 flex-row gap-2">
        <TextInput
          className="min-w-0 flex-1 rounded-2xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, color: colors.text, textAlign }}
          placeholder={t('settings.kitchenSwapFrom')}
          placeholderTextColor={colors.textSecondary}
          value={swapFrom}
          onChangeText={setSwapFrom}
        />
        <TextInput
          className="min-w-0 flex-1 rounded-2xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, color: colors.text, textAlign }}
          placeholder={t('settings.kitchenSwapTo')}
          placeholderTextColor={colors.textSecondary}
          value={swapTo}
          onChangeText={setSwapTo}
        />
      </View>
      <Pressable
        onPress={addSwap}
        className="mb-6 min-h-[44px] items-center justify-center self-start rounded-3xl px-4 active:opacity-80"
        style={{ backgroundColor: colors.primarySoft }}
      >
        <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
          {t('settings.kitchenAddSwap')}
        </Text>
      </Pressable>

      <View className="mb-6 h-px" style={{ backgroundColor: colors.border }} />

      <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.kitchenPantry')}
      </Text>
      <Text className="mb-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
        {t('settings.kitchenPantryHint')}
      </Text>
      {profile.pantryStaples.length === 0 ? (
        <Text className="mb-3 text-sm" style={{ color: colors.textSecondary }}>
          {t('settings.kitchenPantryEmpty')}
        </Text>
      ) : (
        profile.pantryStaples.map((staple) => (
          <View key={staple} className="mb-2 flex-row items-center gap-2">
            <Text className="flex-1 text-sm" style={{ color: colors.text }}>
              {staple}
            </Text>
            <Pressable
              onPress={() => void persist(removePantryStaple(profile, staple))}
              accessibilityLabel={t('common.remove')}
            >
              <Text className="text-xs font-semibold" style={{ color: colors.danger }}>
                {t('common.remove')}
              </Text>
            </Pressable>
          </View>
        ))
      )}
      <View className="mb-3 flex-row gap-2">
        <TextInput
          className="min-w-0 flex-1 rounded-2xl border px-3 py-2.5 text-sm"
          style={{ borderColor: colors.border, color: colors.text, textAlign }}
          placeholder={t('settings.kitchenPantryPlaceholder')}
          placeholderTextColor={colors.textSecondary}
          value={pantryDraft}
          onChangeText={setPantryDraft}
          onSubmitEditing={addPantry}
        />
      </View>
      <Pressable
        onPress={addPantry}
        className="mb-6 min-h-[44px] items-center justify-center self-start rounded-3xl px-4 active:opacity-80"
        style={{ backgroundColor: colors.primarySoft }}
      >
        <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
          {t('settings.kitchenPantryAdd')}
        </Text>
      </Pressable>

      <View className="mb-6 h-px" style={{ backgroundColor: colors.border }} />

      {user ? (
        <>
          <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
            {t('hub.title')}
          </Text>
          <Pressable
            onPress={() => {
              const next = !contributeToHub;
              setContributeToHubState(next);
              void setContributeToHub(user.id, next).catch(() => {
                setContributeToHubState(!next);
                setError(t('settings.kitchenSaveFailed'));
              });
            }}
            className="mb-6 flex-row items-center justify-between rounded-3xl border px-4 py-3.5 active:opacity-80"
            style={{ borderColor: colors.border, backgroundColor: colors.surface }}
            accessibilityRole="switch"
            accessibilityState={{ checked: contributeToHub }}
          >
            <View className="mr-3 min-w-0 flex-1">
              <Text className="text-sm font-semibold" style={{ color: colors.text }}>
                {t('settings.contributeToHub')}
              </Text>
              <Text className="mt-1 text-xs leading-5" style={{ color: colors.textSecondary }}>
                {t('settings.contributeToHubHint')}
              </Text>
            </View>
            <View
              className="h-6 w-11 rounded-full p-0.5"
              style={{ backgroundColor: contributeToHub ? colors.primary : colors.border }}
            >
              <View
                className="h-5 w-5 rounded-full bg-white"
                style={{ alignSelf: contributeToHub ? 'flex-end' : 'flex-start' }}
              />
            </View>
          </Pressable>
        </>
      ) : null}

      <Text className="mb-2 text-sm font-semibold" style={{ color: colors.text }}>
        {t('settings.kitchenAfterSnap')}
      </Text>
      <Pressable
        onPress={() => void persist({ ...profile, autoApplyOnExtract: !profile.autoApplyOnExtract })}
        className="flex-row items-center justify-between rounded-3xl border px-4 py-3.5 active:opacity-80"
        style={{ borderColor: colors.border, backgroundColor: colors.surface }}
        accessibilityRole="switch"
        accessibilityState={{ checked: profile.autoApplyOnExtract }}
      >
        <View className="mr-3 min-w-0 flex-1">
          <Text className="text-sm font-semibold" style={{ color: colors.text }}>
            {t('settings.kitchenAutoApply')}
          </Text>
          <Text className="mt-1 text-xs leading-5" style={{ color: colors.textSecondary }}>
            {t('settings.kitchenAutoApplyHint')}
          </Text>
        </View>
        <View
          className="h-6 w-11 rounded-full p-0.5"
          style={{ backgroundColor: profile.autoApplyOnExtract ? colors.primary : colors.border }}
        >
          <View
            className="h-5 w-5 rounded-full bg-white"
            style={{ alignSelf: profile.autoApplyOnExtract ? 'flex-end' : 'flex-start' }}
          />
        </View>
      </Pressable>
      <Text className="mt-3 text-xs leading-5" style={{ color: colors.textSecondary }}>
        {profile.diets.length === 0 &&
        profile.alwaysSwap.length === 0 &&
        profile.defaultServings == null
          ? t('settings.kitchenPreviewEmpty')
          : [
              ...profile.diets.map((diet) => t(`recipe.variants.${diet}.label`)),
              ...profile.alwaysSwap.map((swap) => `${swap.from} → ${swap.to}`),
              profile.defaultServings
                ? t('settings.kitchenPreviewServings', { count: profile.defaultServings })
                : null,
            ]
              .filter(Boolean)
              .join(' · ')}
      </Text>

      {saving ? (
        <Text className="mt-3 text-xs" style={{ color: colors.textSecondary }}>
          {t('common.save')}…
        </Text>
      ) : null}
      {error ? (
        <Text className="mt-3 text-xs" style={{ color: colors.danger }}>
          {error}
        </Text>
      ) : null}
    </SettingsDetailScreen>
  );
}
