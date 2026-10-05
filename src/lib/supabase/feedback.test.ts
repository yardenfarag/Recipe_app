import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const insert = vi.fn();
  const from = vi.fn(() => ({ insert }));
  const getUser = vi.fn();
  const platform = { OS: 'ios' as string };
  const device = {
    osName: 'iOS' as string | null,
    osVersion: '18.2' as string | null,
    modelName: 'iPhone 15' as string | null,
  };
  return { insert, from, getUser, platform, device };
});

vi.mock('@/lib/supabase/client', () => ({
  supabase: { from: mocks.from, auth: { getUser: mocks.getUser } },
}));
vi.mock('react-native', () => ({ Platform: mocks.platform }));
vi.mock('expo-device', () => mocks.device);
vi.mock('expo-constants', () => ({
  default: {
    nativeAppVersion: '1.4.0',
    nativeBuildVersion: '42',
    expoConfig: { version: '1.3.0' },
  },
}));

import { getFeedbackContext, submitFeedback } from '@/lib/supabase/feedback';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.platform.OS = 'ios';
  mocks.device.osName = 'iOS';
  mocks.device.osVersion = '18.2';
  mocks.device.modelName = 'iPhone 15';
  mocks.insert.mockResolvedValue({ error: null });
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'user-1' } } });
});

describe('getFeedbackContext', () => {
  it('attaches the app version and device', () => {
    expect(getFeedbackContext('he')).toEqual({
      app_version: '1.4.0',
      build_number: '42',
      platform: 'ios',
      os_version: 'iOS 18.2',
      device_model: 'iPhone 15',
      locale: 'he',
    });
  });

  it('copes with the sparse device info on web', () => {
    mocks.platform.OS = 'web';
    mocks.device.osName = null;
    mocks.device.osVersion = null;
    mocks.device.modelName = null;
    expect(getFeedbackContext(' ')).toMatchObject({
      platform: 'web',
      os_version: null,
      device_model: null,
      locale: null,
    });
  });
});

describe('submitFeedback', () => {
  it('stores the trimmed message with the sender and device', async () => {
    await submitFeedback({ message: '  Love the shopping list  ', locale: 'en' });
    expect(mocks.from).toHaveBeenCalledWith('feedback');
    expect(mocks.insert).toHaveBeenCalledWith({
      user_id: 'user-1',
      message: 'Love the shopping list',
      app_version: '1.4.0',
      build_number: '42',
      platform: 'ios',
      os_version: 'iOS 18.2',
      device_model: 'iPhone 15',
      locale: 'en',
    });
  });

  it('rejects an empty or oversized message without calling Supabase', async () => {
    await expect(submitFeedback({ message: '  ', locale: 'en' })).rejects.toThrow();
    await expect(
      submitFeedback({ message: 'x'.repeat(4001), locale: 'en' }),
    ).rejects.toThrow();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('requires a signed-in user', async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });
    await expect(submitFeedback({ message: 'Hello', locale: 'en' })).rejects.toThrow(
      'Sign in to send feedback.',
    );
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('surfaces insert errors', async () => {
    mocks.insert.mockResolvedValue({ error: new Error('denied') });
    await expect(submitFeedback({ message: 'Hello', locale: 'en' })).rejects.toThrow('denied');
  });
});
