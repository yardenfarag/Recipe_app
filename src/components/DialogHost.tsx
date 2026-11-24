import { useSyncExternalStore } from 'react';
import { useTranslation } from 'react-i18next';

import { ConfirmDialog } from '@/components/ConfirmDialog';
import { currentDialog, settleDialog, subscribeDialog, type DialogRequest } from '@/lib/dialog';

/**
 * Draws the questions and notices that `askConfirm()` and `showNotice()` (src/lib/dialog.ts) ask on the web; on a
 * phone those are the system alert and nothing reaches this host. Mounted once in the root layout, so a dialog
 * outlives the screen that asked for it (the "Account deleted" notice shows after Settings is gone).
 */
export function DialogHost() {
  const request = useSyncExternalStore(subscribeDialog, currentDialog, currentDialog);
  if (!request) return null;
  return <HostedDialog key={request.id} request={request} />;
}

function HostedDialog({ request }: { request: DialogRequest }) {
  const { t } = useTranslation();
  const answer = (confirmed: boolean) => settleDialog(request.id, confirmed);

  if (request.kind === 'notice') {
    return (
      <ConfirmDialog
        visible
        trackId={request.trackId ?? 'notice_dialog'}
        title={request.title}
        message={request.message}
        confirmLabel={request.okLabel ?? t('common.dismiss')}
        hideCancel
        onConfirm={() => answer(true)}
        onCancel={() => answer(false)}
      />
    );
  }

  return (
    <ConfirmDialog
      visible
      trackId={request.trackId}
      title={request.title}
      message={request.message}
      confirmLabel={request.confirmLabel}
      cancelLabel={request.cancelLabel}
      destructive={request.destructive}
      onConfirm={() => answer(true)}
      onCancel={() => answer(false)}
    />
  );
}
