import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import {
  submitFeedback as submitSharedFeedback,
  type FeedbackContext,
} from '@shared/lib/supabase/feedback';

export {
  FEEDBACK_MAX_LENGTH,
  FEEDBACK_MIN_LENGTH,
  fetchFeedback,
  type Feedback,
  type FeedbackContext,
} from '@shared/lib/supabase/feedback';

function feedbackPlatform(): FeedbackContext['platform'] {
  return Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web';
}

export function getFeedbackContext(locale: string | null): FeedbackContext {
  return {
    app_version: Constants.nativeAppVersion ?? Constants.expoConfig?.version ?? null,
    build_number: Constants.nativeBuildVersion ?? null,
    platform: feedbackPlatform(),
    os_version: [Device.osName, Device.osVersion].filter(Boolean).join(' ') || null,
    device_model: Device.modelName ?? null,
    locale: locale?.trim() || null,
  };
}

/** The shared call (shared/lib/supabase/feedback.ts), with this device's app version and model. */
export async function submitFeedback(input: {
  message: string;
  locale: string | null;
}): Promise<void> {
  await submitSharedFeedback({ message: input.message, context: getFeedbackContext(input.locale) });
}
