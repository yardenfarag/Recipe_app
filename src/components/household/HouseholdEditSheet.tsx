import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ScrollView, View } from 'react-native';

import { HouseholdAvatarPicker } from '@/components/household/HouseholdAvatarPicker';
import { SheetModal } from '@/components/SheetModal';
import { TextField } from '@/components/text-input';
import { Button } from '@/components/ui/Button';
import { useHousehold } from '@/hooks/useHousehold';
import { announce } from '@/lib/a11y';
import {
  householdAvatarIdFrom,
  householdAvatarValue,
  suggestHouseholdAvatar,
  type HouseholdAvatarId,
} from '@shared/lib/householdAvatars';
import { HouseholdError, updateHousehold } from '@shared/lib/supabase/household';
import { showToast } from '@shared/lib/toast';
import { HOUSEHOLD_NAME_MAX, type Household } from '@shared/types/household';

/** Rename the household or change its picture. Anyone in it can. */
export function HouseholdEditSheet({
  visible,
  onClose,
  household,
}: {
  visible: boolean;
  onClose: () => void;
  household: Household;
}) {
  const { t } = useTranslation();
  const { apply } = useHousehold();
  const [name, setName] = useState(household.name ?? '');
  const [avatar, setAvatar] = useState<HouseholdAvatarId>(
    householdAvatarIdFrom(household.avatar) ?? suggestHouseholdAvatar(household.id),
  );
  const [nameError, setNameError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  // Each time it opens, start from what is saved now (someone else may have changed it).
  useEffect(() => {
    if (!visible) return;
    setName(household.name ?? '');
    setAvatar(householdAvatarIdFrom(household.avatar) ?? suggestHouseholdAvatar(household.id));
    setNameError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  async function save() {
    if (saving) return;
    const trimmed = name.trim();
    if (!trimmed) {
      setNameError(t('household.setup.nameRequired'));
      announce(t('household.setup.nameRequired'));
      return;
    }
    setSaving(true);
    try {
      const next = await updateHousehold({ name: trimmed, avatar: householdAvatarValue(avatar) });
      apply(next);
      showToast(t('household.manage.saved'));
      onClose();
    } catch (err) {
      if (err instanceof HouseholdError && err.code === 'name_required') {
        setNameError(t('household.setup.nameRequired'));
      } else {
        showToast(t('household.saveError'), 'error');
      }
    } finally {
      setSaving(false);
    }
  }

  return (
    <SheetModal
      visible={visible}
      onClose={() => !saving && onClose()}
      title={t('household.manage.editTitle')}
      trackId="household.edit_sheet"
      maxWidth={480}
      footer={
        <View style={{ paddingHorizontal: 20, paddingTop: 8, paddingBottom: 16 }}>
          <Button trackId="household.edit.save" size="lg" fullWidth busy={saving} onPress={() => void save()}>
            {saving ? t('household.manage.saving') : t('household.manage.save')}
          </Button>
        </View>
      }
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 4, paddingBottom: 16, gap: 20 }}
      >
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
          returnKeyType="done"
          error={nameError}
          editable={!saving}
        />
        <HouseholdAvatarPicker value={avatar} onChange={setAvatar} disabled={saving} />
      </ScrollView>
    </SheetModal>
  );
}
