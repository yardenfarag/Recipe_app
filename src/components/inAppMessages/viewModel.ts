import { isRtlAppLanguage } from '@shared/lib/appLanguages';
import {
  isDismissible,
  messageButtons,
  pickContent,
  resolveContentLanguage,
  type ButtonAction,
  type ClickedButton,
  type InAppMessage,
  type Presentation,
} from '@shared/lib/inAppMessages';

export type ViewButton = {
  /** Which slot it was in, for the receipt ("primary", "secondary"). */
  kind: ClickedButton;
  label: string;
  action: ButtonAction;
  style: 'primary' | 'secondary';
};

export type MessageLabels = {
  update: string;
  learnMore: string;
  close: string;
};

/** What a presenter needs, worked out once from the message and the app language. */
export type MessageView = {
  message: InAppMessage;
  /** A required message is always shown full screen, whatever the row says. */
  presentation: Presentation;
  contentLanguage: string;
  /** Layout direction of the message's own language, not of the app. */
  rtl: boolean;
  title: string;
  body: string;
  buttons: ViewButton[];
  link: { label: string; url: string } | null;
  dismissible: boolean;
  /** Default "Close" text, for a close control or an alert with no button of its own. */
  closeLabel: string;
};

/**
 * The text, buttons and link in the user's language (English when the message
 * has none), with these rules:
 * - A message that can't be dismissed shows no "dismiss" button.
 * - A required message always offers the store button; if the admin did not
 *   add one, a default "Update" button is added.
 */
export function buildMessageView(
  message: InAppMessage,
  language: string | null | undefined,
  labels: MessageLabels,
): MessageView {
  const content = pickContent(message, language);
  const contentLanguage = resolveContentLanguage(message, language);
  const dismissible = isDismissible(message);

  const buttons: ViewButton[] = messageButtons(message, language)
    .filter((button) => dismissible || button.action.type !== 'dismiss')
    .map((button, index) => ({
      kind: button.style === 'secondary' ? 'secondary' : 'primary',
      label: button.label,
      action: button.action,
      style: index === 0 ? 'primary' : 'secondary',
    }));

  if (message.required && !buttons.some((button) => button.action.type === 'store')) {
    // The store button comes first and is the prominent one; the admin's own button follows it.
    const own = buttons.slice(0, 1).map((button): ViewButton => ({ ...button, kind: 'secondary', style: 'secondary' }));
    buttons.length = 0;
    buttons.push({ kind: 'primary', label: labels.update, action: { type: 'store' }, style: 'primary' }, ...own);
  }

  const link = message.link
    ? { label: content.linkLabel?.trim() ? content.linkLabel : labels.learnMore, url: message.link.url }
    : null;

  return {
    message,
    presentation: message.required ? 'fullscreen' : message.presentation,
    contentLanguage,
    rtl: isRtlAppLanguage(contentLanguage as never),
    title: content.title,
    body: content.body,
    buttons: buttons.slice(0, 2),
    link,
    dismissible,
    closeLabel: labels.close,
  };
}

/**
 * A dismissible alert whose buttons all do something (open a page, the store)
 * needs a button of its own to close it: iOS closes a system alert only through
 * a button. Costs a place, so `canUseSystemAlert` counts it.
 */
export function needsCloseButton(view: MessageView): boolean {
  return view.dismissible && !view.buttons.some((button) => button.action.type === 'dismiss');
}

/**
 * Can this one be the system alert (UIAlertController / AlertDialog)? Only on
 * iOS and Android; only when the device's layout direction matches the
 * message's language (the system alert follows the device, so Hebrew or
 * Arabic would otherwise come out left-to-right); and only when it has no
 * image and at most two buttons, counting the link and the close button a
 * dismissible alert may need (`needsCloseButton`) as buttons. Otherwise the
 * custom card is used.
 */
export function canUseSystemAlert(
  view: MessageView,
  env: { platform: string; deviceRtl: boolean },
): boolean {
  if (env.platform !== 'ios' && env.platform !== 'android') return false;
  if (view.presentation !== 'alert') return false;
  if (view.message.imageUrl) return false;
  if (env.deviceRtl !== view.rtl) return false;
  return view.buttons.length + (view.link ? 1 : 0) + (needsCloseButton(view) ? 1 : 0) <= 2;
}
