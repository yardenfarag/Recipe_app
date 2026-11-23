import { useTranslation } from 'react-i18next';

import { SegmentedControl } from '@/components/ui/SegmentedControl';
import type { LibraryLayout } from '@/hooks/useLibraryLayout';

type LibraryLayoutToggleProps = {
  layout: LibraryLayout;
  /** Called with the layout tapped, when it isn't the one showing. */
  onChange: (layout: LibraryLayout) => void;
  /**
   * Prefix for the admin Activity log id: `<trackId>.grid` or `<trackId>.list`, named for the layout the tap
   * switches to. A fixed string.
   */
  trackId?: string;
};

/** Photo cards or rows: two icon-only segments, as on the web's Library. */
export function LibraryLayoutToggle({ layout, onChange, trackId = 'library.layout' }: LibraryLayoutToggleProps) {
  const { t } = useTranslation();
  return (
    <SegmentedControl<LibraryLayout>
      label={`${t('library.showGrid')} / ${t('library.showList')}`}
      value={layout}
      onChange={(next) => {
        if (next !== layout) onChange(next);
      }}
      options={[
        { value: 'grid', label: t('library.showGrid'), icon: 'grid-outline', iconOnly: true, trackId: `${trackId}.grid` },
        { value: 'list', label: t('library.showList'), icon: 'list-outline', iconOnly: true, trackId: `${trackId}.list` },
      ]}
    />
  );
}
