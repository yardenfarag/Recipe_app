import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { View } from 'react-native';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { FieldInput } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
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
  const [allergyDraft, setAllergyDraft] = useState('');
  const [dislikeDraft, setDislikeDraft] = useState('');
  /** The allergy waiting for the cook to confirm the notice. */
  const [pending, setPending] = useState<{ next: KitchenProfile; clearDraft: boolean } | null>(null);
  // Hints start with "Pinch"; the kit's Text spells out the app's direction, so they still start at the right side.
  const hintStyle = { color: colors.textSecondary } as const;

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
    <View style={{ gap: 12 }}>
      <View style={{ gap: 4 }}>
        <Text variant="h3">{t('avoid.allergiesTitle')}</Text>
        <Text variant="caption" style={hintStyle}>
          {t('avoid.allergiesHint')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {ALLERGEN_KEYS.map((key) => (
          <Chip
            key={key}
            size="sm"
            trackId={`${trackPrefix}.allergy.toggle`}
            selected={profile.allergies.includes(key)}
            onPress={() => toggleAllergen(key)}
          >
            {t(`avoid.allergens.${key}`)}
          </Chip>
        ))}
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
        <Text variant="caption" tone="muted">
          {t('avoid.limit', { count: MAX_OTHER_ALLERGIES })}
        </Text>
      ) : (
        <AddRow
          value={allergyDraft}
          onChangeText={setAllergyDraft}
          placeholder={t('avoid.otherAllergyPlaceholder')}
          trackId={`${trackPrefix}.allergy.add`}
          onAdd={addOtherAllergy}
        />
      )}
      {hasAllergies(profile) ? (
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
          <Ionicons name="alert-circle-outline" size={16} color={colors.warning} style={{ marginTop: 1 }} />
          <Text variant="caption" style={[hintStyle, { flex: 1, minWidth: 0 }]}>
            {t('avoid.checkLabels')}
          </Text>
        </View>
      ) : null}

      <View style={{ gap: 4, marginTop: 16 }}>
        <Text variant="h3">{t('avoid.dislikesTitle')}</Text>
        <Text variant="caption" style={hintStyle}>
          {t('avoid.dislikesHint')}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}>
        {DISLIKE_SUGGESTION_KEYS.map((key) => {
          const active = profile.dislikes.some((item) => dislikeSuggestionFor(item) === key);
          const blocked = dislikesFull && !active;
          return (
            <Chip
              key={key}
              size="sm"
              trackId={`${trackPrefix}.dislike.toggle`}
              selected={active}
              disabled={blocked}
              onPress={() => toggleSuggestion(key)}
            >
              {t(`avoid.suggestions.${key}`)}
            </Chip>
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
        <Text variant="caption" tone="muted">
          {t('avoid.limit', { count: MAX_DISLIKES })}
        </Text>
      ) : (
        <AddRow
          value={dislikeDraft}
          onChangeText={setDislikeDraft}
          placeholder={t('avoid.dislikePlaceholder')}
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

/** A typed item, shown as a chosen chip with a cross: tapping it removes it. */
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
  const type = useTypography();
  return (
    <Chip
      size="sm"
      trackId={trackId}
      selected
      accessibilityLabel={t('a11y.removeItem', { item: label })}
      onPress={onRemove}
    >
      <Text
        numberOfLines={1}
        color={colors.background}
        style={{ ...type.font('body', 'semibold'), fontSize: 13, lineHeight: 17 }}
      >
        {label}
      </Text>
      <Ionicons name="close" size={15} color={colors.background} />
    </Chip>
  );
}

function AddRow({
  value,
  onChangeText,
  placeholder,
  trackId,
  onAdd,
}: {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  trackId: string;
  onAdd: () => void;
}) {
  const { t } = useTranslation();
  const empty = !value.trim();
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
      <FieldInput
        containerStyle={{ flex: 1 }}
        placeholder={placeholder}
        accessibilityLabel={placeholder}
        value={value}
        onChangeText={onChangeText}
        maxLength={MAX_AVOID_ITEM_CHARS}
        returnKeyType="done"
        onSubmitEditing={() => {
          logTap(`${trackId}.submit`);
          onAdd();
        }}
      />
      <Button
        trackId={trackId}
        variant="secondary"
        disabled={empty}
        accessibilityLabel={t('avoid.add')}
        onPress={onAdd}
      >
        {t('avoid.add')}
      </Button>
    </View>
  );
}
