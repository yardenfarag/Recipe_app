import { router } from 'expo-router';
import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/SegmentedControl';

/**
 * "My Library | Hub" (PIN-77): the Hub sits inside the Library instead of having its own tab in the bar. Each side
 * keeps its own screen and address (/ and /hub), so Hub links still open the Hub.
 */
export function LibraryTabs({ current }: { current: 'library' | 'hub' }) {
  const { t } = useTranslation();
  return (
    <SegmentedControl<'library' | 'hub'>
      label={t('plan.libraryTabs.label')}
      kind="tabs"
      fullWidth
      value={current}
      onChange={(value) => {
        if (value === current) return;
        router.navigate(value === 'hub' ? '/hub' : '/');
      }}
      options={[
        { value: 'library', label: t('plan.libraryTabs.mine'), trackId: 'library.tab.mine' },
        { value: 'hub', label: t('tabs.hub'), trackId: 'library.tab.hub' },
      ]}
    />
  );
}
