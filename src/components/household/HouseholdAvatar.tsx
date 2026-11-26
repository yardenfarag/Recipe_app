import { View } from 'react-native';
import { SvgXml } from 'react-native-svg';

import { ProfileAvatar } from '@/components/ProfileAvatar';
import { Text } from '@/components/ui/Text';
import { KitIcon } from '@/components/ui/tokens';
import { useThemePreference } from '@/hooks/useThemePreference';
import { useTypography } from '@/hooks/useTypography';
import { memberInitial } from '@shared/lib/household';
import { householdAvatarIdFrom, householdAvatarSvg, type HouseholdAvatarId } from '@shared/lib/householdAvatars';
import { stackMembers } from '@/lib/householdHelpers';

/** A household picture's drawing: a rounded square with a little house behind the dish. Never cropped to a circle. */
export function HouseholdAvatarArt({ id, size }: { id: HouseholdAvatarId; size: number }) {
  return <SvgXml xml={householdAvatarSvg(id)} width={size} height={size} />;
}

/**
 * The household's picture (`house:<id>`), or a house outline on a rounded square when there is none (not set up, or
 * a picture a newer version added). Decorative: the name next to it says whose it is.
 */
export function HouseholdAvatar({ value, size }: { value: string | null | undefined; size: number }) {
  const { colors } = useThemePreference();
  const id = householdAvatarIdFrom(value);
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.26,
        overflow: 'hidden',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: id ? 'transparent' : colors.backgroundElement,
      }}
    >
      {id ? (
        <HouseholdAvatarArt id={id} size={size} />
      ) : (
        <KitIcon icon="home-outline" size={Math.round(size * 0.45)} color={colors.textSecondary} />
      )}
    </View>
  );
}

type MemberLike = { displayName: string; avatarUrl: string | null };

/** A person in the household: their profile picture, or the first letter of their name on the soft brand colour. */
export function MemberAvatar({ member, size, ring }: { member: MemberLike; size: number; ring?: string }) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const ringStyle = ring ? { borderWidth: 2, borderColor: ring, borderRadius: (size + 4) / 2 } : null;
  if (member.avatarUrl) {
    return (
      <View accessible={false} importantForAccessibility="no-hide-descendants" style={ringStyle}>
        <ProfileAvatar url={member.avatarUrl} size={size} />
      </View>
    );
  }
  const fontSize = Math.max(10, Math.round(size * 0.42));
  return (
    <View accessible={false} importantForAccessibility="no-hide-descendants" style={ringStyle}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: colors.primarySoft,
        }}
      >
        <Text
          color={colors.primaryText}
          maxFontSizeMultiplier={1}
          style={{ ...type.font('display', 'bold'), fontSize, lineHeight: Math.round(fontSize * 1.15) }}
        >
          {memberInitial(member.displayName)}
        </Text>
      </View>
    </View>
  );
}

/**
 * A few people's pictures overlapping in a row, with "+N" for the rest. Decorative: give the row around it a label
 * ("Shared with Dana and Avi").
 */
export function MemberStack({ members, size = 28, max = 4 }: { members: MemberLike[]; size?: number; max?: number }) {
  const { colors } = useThemePreference();
  const type = useTypography();
  const { shown, extra } = stackMembers(members, max);
  const overlap = Math.round(size * 0.3);
  const fontSize = Math.max(10, Math.round(size * 0.38));
  return (
    <View
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      style={{ flexDirection: 'row', alignItems: 'center' }}
    >
      {shown.map((member, index) => (
        <View key={`${member.displayName}-${index}`} style={{ marginStart: index === 0 ? 0 : -overlap }}>
          <MemberAvatar member={member} size={size} ring={colors.surface} />
        </View>
      ))}
      {extra > 0 ? (
        <View
          style={{
            marginStart: shown.length === 0 ? 0 : -overlap,
            width: size + 4,
            height: size + 4,
            borderRadius: (size + 4) / 2,
            borderWidth: 2,
            borderColor: colors.surface,
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: colors.backgroundElement,
          }}
        >
          <Text
            maxFontSizeMultiplier={1}
            style={{ ...type.font('body', 'semibold'), fontSize, lineHeight: Math.round(fontSize * 1.2) }}
          >
            {`+${extra}`}
          </Text>
        </View>
      ) : null}
    </View>
  );
}
