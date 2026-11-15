import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';

import { useLanguagePreference } from '@/hooks/useLanguagePreference';
import type { InAppMessage } from '@/lib/inAppMessages';

import { buildMessageView, type MessageView } from './viewModel';

/** The message worked out for the user's language, with the default button labels. */
export function useMessageView(message: InAppMessage): MessageView {
  const { t } = useTranslation();
  const { language } = useLanguagePreference();
  const update = t('inAppMessages.update');
  const learnMore = t('inAppMessages.learnMore');
  const close = t('inAppMessages.close');
  return useMemo(
    () => buildMessageView(message, language, { update, learnMore, close }),
    [message, language, update, learnMore, close],
  );
}
