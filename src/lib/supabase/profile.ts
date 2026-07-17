import { decode } from 'base64-arraybuffer';

import { supabase } from '@/lib/supabase/client';

const AVATAR_BUCKET = 'avatars';

export interface Profile {
  id: string;
  email: string | null;
  avatar_url: string | null;
}

export async function fetchProfile(userId: string): Promise<Profile | null> {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, email, avatar_url')
    .eq('id', userId)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // no row
    throw error;
  }
  return data as Profile;
}

/**
 * Uploads a locally-picked image (as base64, from `expo-image-picker`) to the
 * `avatars` Storage bucket and points `profiles.avatar_url` at the resulting
 * public URL. React Native's `fetch`/`Blob` upload path is unreliable with
 * Supabase Storage, so we decode base64 -> ArrayBuffer instead (the
 * documented working approach).
 */
export async function uploadAvatar(
  userId: string,
  base64: string,
  fileExt: string,
): Promise<string> {
  const path = `${userId}-${Date.now()}.${fileExt}`;
  const arrayBuffer = decode(base64);

  const { error: uploadError } = await supabase.storage
    .from(AVATAR_BUCKET)
    .upload(path, arrayBuffer, {
      contentType: `image/${fileExt === 'jpg' ? 'jpeg' : fileExt}`,
      upsert: true,
    });
  if (uploadError) throw uploadError;

  const {
    data: { publicUrl },
  } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);

  const { error: updateError } = await supabase
    .from('profiles')
    .update({ avatar_url: publicUrl })
    .eq('id', userId);
  if (updateError) throw updateError;

  return publicUrl;
}
