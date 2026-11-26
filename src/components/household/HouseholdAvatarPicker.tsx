import { View } from 'react-native';
import { useTranslation } from 'react-i18next';

import { HouseholdAvatarArt } from '@/components/household/HouseholdAvatar';
import { Pressable } from '@/components/ui/Pressable';
import { Text } from '@/components/ui/Text';
import { useThemePreference } from '@/hooks/useThemePreference';
import { HOUSEHOLD_AVATAR_IDS, type HouseholdAvatarId } from '@shared/lib/householdAvatars';

const ART = 56;

/**
 * The twelve household pictures as a set of radio buttons: the chosen one ringed in the brand colour. Wraps to as
 * many per row as fit, so a phone shows four or five and a tablet all twelve.
 */
export function HouseholdAvatarPicker({
  value,
  onChange,
  disabled = false,
}: {
  value: HouseholdAvatarId;
  onChange: (id: HouseholdAvatarId) => void;
  disabled?: boolean;
}) {
  const { t } = useTranslation();
  const { colors } = useThemePreference();
  return (
    <View style={{ gap: 10 }}>
      <Text variant="bodySmall" weight="semibold">
        {t('household.setup.avatarLabel')}
      </Text>
      <View
        accessibilityRole="radiogroup"
        accessibilityLabel={t('household.setup.avatarLabel')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8 }}
      >
        {HOUSEHOLD_AVATAR_IDS.map((id) => {
          const selected = id === value;
          return (
            <Pressable
              key={id}
              trackId={`household.picture.${id}`}
              onPress={() => onChange(id)}
              disabled={disabled}
              accessibilityRole="radio"
              accessibilityLabel={t(`household.avatars.${id}`)}
              accessibilityState={{ checked: selected, disabled }}
              style={({ pressed }) => ({
                width: ART + 12,
                height: ART + 12,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 22,
                borderWidth: 3,
                borderColor: selected ? colors.primary : 'transparent',
                opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
              })}
            >
              <HouseholdAvatarArt id={id} size={ART} />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}
