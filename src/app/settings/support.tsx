import Ionicons from '@expo/vector-icons/Ionicons';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Pressable, Text, View } from 'react-native';

import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { SupportTicketModal } from '@/components/SupportTicketModal';
import { useAuth } from '@/hooks/useAuth';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';

type SupportRowProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  last?: boolean;
};

function SupportRow({ label, icon, onPress, last = false }: SupportRowProps) {
  const { colors } = useThemePreference();
  const { chevronForward } = useRtl();

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      className="min-h-12 flex-row items-center gap-3 py-3 active:opacity-65"
      style={{
        borderColor: colors.frostedBorder,
        borderBottomWidth: last ? 0 : 1,
      }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: colors.primarySoft }}
      >
        <Ionicons name={icon} size={18} color={colors.primary} />
      </View>
      <Text className="min-w-0 flex-1 text-sm font-semibold" style={{ color: colors.text }}>
        {label}
      </Text>
      <Ionicons
        name={chevronForward}
        size={17}
        color={colors.textSecondary}
      />
    </Pressable>
  );
}

export default function SupportSettingsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <>
      <SettingsDetailScreen>
        {user ? (
          <SupportRow
            label={t('settings.reportIssue')}
            icon="chatbubble-ellipses-outline"
            onPress={() => setSupportOpen(true)}
          />
        ) : null}
        <SupportRow
          label={t('settings.emailSupport')}
          icon="mail-outline"
          onPress={() => void openLegalUrl(LEGAL_URLS.supportMailto)}
        />
        <SupportRow
          label={t('settings.privacyPolicy')}
          icon="lock-closed-outline"
          onPress={() => void openLegalUrl(LEGAL_URLS.privacy)}
        />
        <SupportRow
          label={t('settings.termsOfUse')}
          icon="document-text-outline"
          onPress={() => void openLegalUrl(LEGAL_URLS.terms)}
        />
        <SupportRow
          label={t('settings.deleteAccountWeb')}
          icon="globe-outline"
          onPress={() => void openLegalUrl(LEGAL_URLS.deleteAccount)}
          last
        />
      </SettingsDetailScreen>
      <SupportTicketModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
