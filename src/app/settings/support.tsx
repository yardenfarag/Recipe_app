import { type Href, router } from 'expo-router';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Platform } from 'react-native';

import { openLegalDoc } from '@/components/LegalDocument';
import { SettingsDetailScreen } from '@/components/SettingsDetailScreen';
import { SettingsGroup, SettingsRow } from '@/components/SettingsMenu';
import { SupportTicketModal } from '@/components/SupportTicketModal';
import { useAuth } from '@/hooks/useAuth';
import { LEGAL_URLS, openLegalUrl } from '@/lib/legal';

export default function SupportSettingsScreen() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);

  return (
    <>
      <SettingsDetailScreen>
        <SettingsGroup title={t('settings.helpSupport')}>
          {Platform.OS === 'web' ? (
            <SettingsRow
              trackId="support.about_pinch"
              label={t('settings.aboutPinch')}
              icon="phone-portrait-outline"
              onPress={() => router.push('/welcome' as Href)}
            />
          ) : null}
          {user ? (
            <SettingsRow
              trackId="support.report_issue"
              label={t('settings.reportIssue')}
              icon="chatbubble-ellipses-outline"
              onPress={() => setSupportOpen(true)}
            />
          ) : null}
          <SettingsRow
            trackId="support.email_support"
            label={t('settings.emailSupport')}
            icon="mail-outline"
            role="link"
            onPress={() => void openLegalUrl(LEGAL_URLS.supportMailto)}
          />
        </SettingsGroup>
        <SettingsGroup title={t('settings.legal')}>
          <SettingsRow
            trackId="support.privacy_policy"
            label={t('settings.privacyPolicy')}
            icon="lock-closed-outline"
            onPress={() => openLegalDoc('privacy')}
          />
          <SettingsRow
            trackId="support.terms_of_use"
            label={t('settings.termsOfUse')}
            icon="document-text-outline"
            onPress={() => openLegalDoc('terms')}
          />
          <SettingsRow
            trackId="support.delete_account_guide"
            label={t('settings.deleteAccountGuide')}
            icon="trash-outline"
            onPress={() => openLegalDoc('delete-account')}
          />
          <SettingsRow
            trackId="support.delete_data_guide"
            label={t('settings.deleteDataGuide')}
            icon="globe-outline"
            onPress={() => openLegalDoc('delete-data')}
          />
        </SettingsGroup>
      </SettingsDetailScreen>
      <SupportTicketModal visible={supportOpen} onClose={() => setSupportOpen(false)} />
    </>
  );
}
