import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Text, View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { TextInput } from '@/components/text-input';
import { Pressable } from '@/components/ui/Pressable';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { announce } from '@/lib/a11y';
import {
  ALLERGEN_KEYS,
  DISLIKE_SUGGESTION_KEYS,
  MAX_AVOID_ITEM_CHARS,
  MAX_DISLIKES,
  MAX_OTHER_ALLERGIES,
  cleanAvoidItem,
  dislikeSuggestionFor,
  hasAllergies,
  normalizeFoodText,
  type AllergenKey,
  type DislikeSuggestionKey,
} from '@shared/lib/avoidList';
import { logTap } from '@/lib/interactionLog';
import type { KitchenProfile } from '@/lib/kitchenProfile';

type AvoidListEditorProps = {
  profile: KitchenProfile;
  /** Saves the next profile. Called on every tap, like the diet chips. */
  onChange: (next: KitchenProfile) => void;
  /**
   * Prefix for the admin Activity log ids. An allergy is health information, so the ids never
   * say which allergy or food was tapped.
   */
  trackPrefix: string;
};

function sameItem(a: string, b: string): boolean {
  return normalizeFoodText(a) === normalizeFoodText(b);
}

/**
 * Allergies and dislikes (PIN-105), shared by onboarding and Settings. The first allergy asks the
 * cook to confirm a short notice; after that the reminder stays under the list.
 */
export function AvoidListEditor({ profile, onChange, trackPrefix }: AvoidListEditorProps) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const { textAlign, writingDirection } = useRtl();
  const [allergyDraft, setAllergyDraft] = useState('');
  const [dislikeDraft, setDislikeDraft] = useState('');
  /** The allergy waiting for the cook to confirm the notice. */
  const [pending, setPending] = useState<{ next: KitchenProfile; clearDraft: boolean } | null>(null);
  // Hints start with "Pinch", so the text needs the app's direction spelled out.
  const hintStyle = { color: colors.textSecondary, textAlign, writingDirection } as const;

  const customDislikes = profile.dislikes.filter((item) => dislikeSuggestionFor(item) == null);
  const otherFull = profile.otherAllergies.length >= MAX_OTHER_ALLERGIES;
  const dislikesFull = profile.dislikes.length >= MAX_DISLIKES;

  /** Adding an allergy asks for the notice once. Removing one never asks. */
  function saveAllergies(next: KitchenProfile, clearDraft = false) {
    if (!profile.allergyNoticeAcceptedAt) {
      setPending({ next, clearDraft });
      return;
    }
    onChange(next);
    if (clearDraft) setAllergyDraft('');
  }

  function acceptNotice() {
    if (!pending) return;
    onChange({ ...pending.next, allergyNoticeAcceptedAt: new Date().toISOString() });
    if (pending.clearDraft) setAllergyDraft('');
    setPending(null);
  }

  function toggleAllergen(key: AllergenKey) {
    if (profile.allergies.includes(key)) {
      onChange({ ...profile, allergies: profile.allergies.filter((item) => item !== key) });
      return;
    }
    saveAllergies({
      ...profile,
      allergies: ALLERGEN_KEYS.filter((item) => item === key || profile.allergies.includes(item)),
    });
  }

  function addOtherAllergy() {
    const item = cleanAvoidItem(allergyDraft);
    if (!item || otherFull) return;
    if (profile.otherAllergies.some((existing) => sameItem(existing, item))) {
      setAllergyDraft('');
      return;
    }
    saveAllergies({ ...profile, otherAllergies: [...profile.otherAllergies, item] }, true);
  }

  function toggleSuggestion(key: DislikeSuggestionKey) {
    const active = profile.dislikes.some((item) => dislikeSuggestionFor(item) === key);
    if (active) {
      onChange({ ...profile, dislikes: profile.dislikes.filter((item) => dislikeSuggestionFor(item) !== key) });
      return;
    }
    if (dislikesFull) {
      announce(t('avoid.limit', { count: MAX_DISLIKES }));
      return;
    }
    onChange({ ...profile, dislikes: [...profile.dislikes, t(`avoid.suggestions.${key}`)] });
  }

  function addDislike() {
    const item = cleanAvoidItem(dislikeDraft);
    if (!item || dislikesFull) return;
    setDislikeDraft('');
    if (profile.dislikes.some((existing) => sameItem(existing, item))) return;
    onChange({ ...profile, dislikes: [...profile.dislikes, item] });
  }

  return (
    <View>
      <Text className="mb-1 text-sm font-semibold" style={{ color: colors.text }} accessibilityRole="header">
        {t('avoid.allergiesTitle')}
      </Text>
      <Text className="mb-3 text-xs leading-5" style={hintStyle}>
        {t('avoid.allergiesHint')}
      </Text>
      <View className="mb-3 flex-row flex-wrap gap-2">
        {ALLERGEN_KEYS.map((key) => {
          const active = profile.allergies.includes(key);
          return (
            <Pressable
              key={key}
              trackId={`${trackPrefix}.allergy.toggle`}
              onPress={() => toggleAllergen(key)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active }}
              className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
              style={{ backgroundColor: active ? colors.primary : colors.frosted }}
            >
              <Text className="text-sm font-semibold" style={{ color: active ? colors.onPrimary : colors.text }}>
                {t(`avoid.allergens.${key}`)}
              </Text>
            </Pressable>
          );
        })}
        {profile.otherAllergies.map((item) => (
          <RemovableChip
            key={item}
            label={item}
            trackId={`${trackPrefix}.allergy.remove`}
            onRemove={() =>
              onChange({
                ...profile,
                otherAllergies: profile.otherAllergies.filter((existing) => existing !== item),
              })
            }
          />
        ))}
      </View>
      {otherFull ? (
        <Text className="mb-2 text-xs leading-5" style={{ color: colors.textSecondary }}>
          {t('avoid.limit', { count: MAX_OTHER_ALLERGIES })}
        </Text>
      ) : (
        <AddRow
          value={allergyDraft}
          onChangeText={setAllergyDraft}
          placeholder={t('avoid.otherAllergyPlaceholder')}
          textAlign={textAlign}
          trackId={`${trackPrefix}.allergy.add`}
          onAdd={addOtherAllergy}
        />
      )}
      {hasAllergies(profile) ? (
        <View className="mt-1 flex-row items-start gap-2">
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} style={{ marginTop: 2 }} />
          <Text className="min-w-0 flex-1 text-xs leading-5" style={hintStyle}>
            {t('avoid.checkLabels')}
          </Text>
        </View>
      ) : null}

      <Text className="mb-1 mt-7 text-sm font-semibold" style={{ color: colors.text }} accessibilityRole="header">
        {t('avoid.dislikesTitle')}
      </Text>
      <Text className="mb-3 text-xs leading-5" style={hintStyle}>
        {t('avoid.dislikesHint')}
      </Text>
      <View className="mb-3 flex-row flex-wrap gap-2">
        {DISLIKE_SUGGESTION_KEYS.map((key) => {
          const active = profile.dislikes.some((item) => dislikeSuggestionFor(item) === key);
          const blocked = dislikesFull && !active;
          return (
            <Pressable
              key={key}
              trackId={`${trackPrefix}.dislike.toggle`}
              onPress={() => toggleSuggestion(key)}
              disabled={blocked}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: active, disabled: blocked }}
              className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
              style={{
                backgroundColor: active ? colors.primary : colors.frosted,
                opacity: blocked ? 0.45 : 1,
              }}
            >
              <Text className="text-sm font-semibold" style={{ color: active ? colors.onPrimary : colors.text }}>
                {t(`avoid.suggestions.${key}`)}
              </Text>
            </Pressable>
          );
        })}
        {customDislikes.map((item) => (
          <RemovableChip
            key={item}
            label={item}
            trackId={`${trackPrefix}.dislike.remove`}
            onRemove={() =>
              onChange({ ...profile, dislikes: profile.dislikes.filter((existing) => existing !== item) })
            }
          />
        ))}
      </View>
      {dislikesFull ? (
        <Text className="text-xs leading-5" style={{ color: colors.textSecondary }}>
          {t('avoid.limit', { count: MAX_DISLIKES })}
        </Text>
      ) : (
        <AddRow
          value={dislikeDraft}
          onChangeText={setDislikeDraft}
          placeholder={t('avoid.dislikePlaceholder')}
          textAlign={textAlign}
          trackId={`${trackPrefix}.dislike.add`}
          onAdd={addDislike}
        />
      )}

      <ConfirmDialog
        visible={pending != null}
        title={t('avoid.noticeTitle')}
        message={t('avoid.noticeBody')}
        confirmLabel={t('avoid.noticeConfirm')}
        cancelLabel={t('common.notNow')}
        onConfirm={acceptNotice}
        onCancel={() => setPending(null)}
        trackId={`${trackPrefix}.allergy.notice`}
      />
    </View>
  );
}

/** A typed item, shown as a selected chip with a remove button. */
function RemovableChip({
  label,
  trackId,
  onRemove,
}: {
  label: string;
  trackId: string;
  onRemove: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  return (
    <Pressable
      trackId={trackId}
      onPress={onRemove}
      accessibilityRole="button"
      accessibilityLabel={t('a11y.removeItem', { item: label })}
      className="min-h-[44px] flex-row items-center gap-1.5 rounded-2xl px-4 active:opacity-80"
      style={{ backgroundColor: colors.primary }}
    >
      <Text className="text-sm font-semibold" style={{ color: colors.onPrimary }}>
        {label}
      </Text>
      <Ionicons name="close" size={15} color={colors.onPrimary} />
    </Pressable>
  );
}

function AddRow({
  value,
  onChangeText,
  placeholder,
  textAlign,
  trackId,
  onAdd,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  textAlign: 'left' | 'right';
  trackId: string;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  const empty = !value.trim();
  return (
    <View className="mb-2 flex-row items-center gap-2">
      <TextInput
        className="min-h-[44px] min-w-0 flex-1 rounded-2xl border px-3 py-2.5 text-sm"
        style={{ borderColor: colors.border, color: colors.text, textAlign }}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        placeholderTextColor={colors.textSecondary}
        value={value}
        onChangeText={onChangeText}
        maxLength={MAX_AVOID_ITEM_CHARS}
        returnKeyType="done"
        onSubmitEditing={() => {
          logTap(`${trackId}.submit`);
          onAdd();
        }}
      />
      <Pressable
        trackId={trackId}
        onPress={onAdd}
        disabled={empty}
        accessibilityRole="button"
        accessibilityLabel={t('avoid.add')}
        accessibilityState={{ disabled: empty }}
        className="min-h-[44px] items-center justify-center rounded-2xl px-4 active:opacity-80"
        style={{ backgroundColor: colors.primarySoft, opacity: empty ? 0.45 : 1 }}
      >
        <Text className="text-sm font-semibold" style={{ color: colors.primary }}>
          {t('avoid.add')}
        </Text>
      </Pressable>
    </View>
  );
}
