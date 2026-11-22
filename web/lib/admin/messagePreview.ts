import type { AdminMessageDraft, InAppMessage } from "@shared/lib/inAppMessages";

/** The draft being written, as the message the app would show (the preview needs an id; a new one has none yet). */
export function previewMessage(draft: AdminMessageDraft): InAppMessage {
  return {
    id: draft.id ?? "preview",
    presentation: draft.presentation,
    tone: draft.tone,
    icon: draft.icon,
    imageUrl: draft.imageUrl,
    content: draft.content,
    primaryAction: draft.primaryAction,
    secondaryAction: draft.secondaryAction,
    link: draft.link,
    dismissible: draft.dismissible,
    required: draft.required,
    frequency: draft.frequency,
    maxShows: draft.maxShows,
    priority: draft.priority,
    screens: draft.screens,
    bannerPosition: draft.bannerPosition,
    delaySeconds: draft.delaySeconds,
  };
}
