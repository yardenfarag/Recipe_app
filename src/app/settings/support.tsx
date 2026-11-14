import Ionicons from '@expo/vector-icons/Ionicons';
import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform, Text, View } from 'react-native';
import { Pressable } from '@/components/ui/Pressable';

import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { SupportTicketModal } from '@/components/SupportTicketModal';
import { useAuth } from '@/hooks/useAuth';
import { useRtl } from '@/hooks/useRtl';
import { useThemePreference } from '@/hooks/useThemePreference';
import { openLegalDoc } from '@/components/LegalDocument';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';

type SupportRowProps = {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
  last?: boolean;
  /** "link" for rows that leave the app (mailto / external URL). */
  role?: 'button' | 'link';
  /** Fixed id for the admin Activity log, like 'support.privacy_policy'. */
  trackId: string;
};

function SupportRow({
  label,
  icon,
  onPress,
  last = false,
  role = 'button',
  trackId,
}: SupportRowProps) {
  const { colors } = useThemePreference();
  const { chevronForward } = useRtl();

  return (
    <Pressable trackId={trackId}
      onPress={onPress}
      accessibilityRole={role}
      accessibilityLabel={label}
      className="min-h-12 flex-row items-center gap-3 py-3 active:opacity-65"
      style={{
        borderColor: colors.frostedBorder,
        borderBottomWidth: last ? 0 : 1,
      }}
    >
      <View
        className="h-9 w-9 items-center justify-center rounded-[14px]"
        style={{ backgroundColor: colors.primarySoft }}
        accessible={false}
        importantForAccessibility="no-hide-descendants"
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
        accessible={false}
        importantForAccessibility="no"
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
        {Platform.OS === 'web' ? (
          <SupportRow
            trackId="support.about_pinch"
            label={t('settings.aboutPinch')}
            icon="phone-portrait-outline"
            onPress={() => router.push('/welcome' as Href)}
          />
        ) : null}
        {user ? (
          <SupportRow
            trackId="support.report_issue"
            label={t('settings.reportIssue')}
            icon="chatbubble-ellipses-outline"
            onPress={() => setSupportOpen(true)}
          />
        ) : null}
        <SupportRow
          trackId="support.email_support"
          label={t('settings.emailSupport')}
          icon="mail-outline"
          role="link"
          onPress={() => void openLegalUrl(LEGAL_URLS.supportMailto)}
        />
        <SupportRow
          trackId="support.privacy_policy"
          label={t('settings.privacyPolicy')}
          icon="lock-closed-outline"
          onPress={() => openLegalDoc('privacy')}
        />
        <SupportRow
          trackId="support.terms_of_use"
          label={t('settings.termsOfUse')}
          icon="document-text-outline"
          onPress={() => openLegalDoc('terms')}
        />
        <SupportRow
          trackId="support.delete_account_guide"
          label={t('settings.deleteAccountGuide')}
          icon="trash-outline"
          onPress={() => openLegalDoc('delete-account')}
        />
        <SupportRow
          trackId="support.delete_data_guide"
          label={t('settings.deleteDataGuide')}
          icon="globe-outline"
          onPress={() => openLegalDoc('delete-data')}
          last
        />
      </SettingsDetailScreen>
      <SupportTicketModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
