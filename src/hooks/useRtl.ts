import { isRtlAppLanguage } from '@/lib/appLanguages';
import { useLanguagePreference } from '@/hooks/useLanguagePreference';

/** App-language RTL, independent of whether I18nManager has reloaded yet. */
export function useRtl() {
  const { language } = useLanguagePreference();
  const rtl = isRtlAppLanguage(language);

  return {
    rtl,
    writingDirection: (rtl ? 'rtl' : 'ltr') as 'rtl' | 'ltr',
    textAlign: (rtl ? 'right' : 'left') as 'right' | 'left',
    chevronForward: (rtl ? 'chevron-back' : 'chevron-forward') as
      | 'chevron-back'
      | 'chevron-forward',
    chevronBack: (rtl ? 'chevron-forward' : 'chevron-back') as
      | 'chevron-forward'
      | 'chevron-back',
  };
}
