import { describe, expect, it } from 'vitest';

import { languageChangeNeedsReload } from '@/lib/rtlLayout';

describe('languageChangeNeedsReload', () => {
  it('is needed only when crossing LTR/RTL', () => {
    expect(languageChangeNeedsReload('en', 'he')).toBe(true);
    expect(languageChangeNeedsReload('he', 'ar')).toBe(false);
    expect(languageChangeNeedsReload('en', 'es')).toBe(false);
    expect(languageChangeNeedsReload('ar', 'en')).toBe(true);
  });
});
