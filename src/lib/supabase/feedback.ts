import Constants from 'expo-constants';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

import { supabase } from '@/lib/supabase/client';

export const FEEDBACK_MIN_LENGTH = 2;
export const FEEDBACK_MAX_LENGTH = 4000;

/** Where the feedback came from, stored next to the message. */
export interface FeedbackContext {
  app_version: string | null;
  build_number: string | null;
  platform: 'ios' | 'android' | 'web';
  os_version: string | null;
  device_model: string | null;
  locale: string | null;
}

export interface Feedback extends FeedbackContext {
  id: string;
  user_id: string | null;
  message: string;
  created_at: string;
  /** Sender's email, via the profiles join (null once the account is deleted). */
  profile: { email: string | null } | null;
}

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

export async function submitFeedback(input: {
  message: string;
  locale: string | null;
}): Promise<void> {
  const message = input.message.trim();
  if (message.length < FEEDBACK_MIN_LENGTH) {
    throw new Error('Write a few words first.');
  }
  if (message.length > FEEDBACK_MAX_LENGTH) {
    throw new Error(`Feedback is too long (max ${FEEDBACK_MAX_LENGTH} characters).`);
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Sign in to send feedback.');
  }

  const { error } = await supabase.from('feedback').insert({
    user_id: user.id,
    message,
    ...getFeedbackContext(input.locale),
  });
  if (error) throw error;
}

export async function fetchFeedback(limit = 80): Promise<Feedback[]> {
  const { data, error } = await supabase
    .from('feedback')
    .select(
      'id, user_id, message, app_version, build_number, platform, os_version, device_model, locale, created_at, profile:profiles(email)',
    )
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw error;
  // Many-to-one embed: PostgREST returns an object, the untyped client guesses an array.
  return (data ?? []) as unknown as Feedback[];
}
