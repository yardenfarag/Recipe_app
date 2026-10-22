import { describe, expect, it, vi } from 'vitest';

// The real `expo` entry opens a dev-server socket on import.
vi.mock('expo', () => ({ reloadAppAsync: vi.fn() }));

import { languageChangeNeedsReload } from '@/lib/rtlLayout';

describe('languageChangeNeedsReload', () => {
  it('is needed only when crossing LTR/RTL', () => {
    expect(languageChangeNeedsReload('en', 'he')).toBe(true);
    expect(languageChangeNeedsReload('he', 'ar')).toBe(false);
    expect(languageChangeNeedsReload('en', 'es')).toBe(false);
    expect(languageChangeNeedsReload('ar', 'en')).toBe(true);
  });
});
