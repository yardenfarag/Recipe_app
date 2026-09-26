import { describe, expect, it } from 'vitest';

import { isLegalDocId, legalDoc, legalHref } from '@/lib/legalDocs';

describe('legalDoc', () => {
  it('resolves the in-app legal pages', () => {
    expect(isLegalDocId('privacy')).toBe(true);
    expect(legalHref('terms')).toBe('/legal/terms');
    expect(legalDoc('delete-account')?.title).toBe('Delete your account');
    expect(legalDoc('nope')).toBeNull();
  });
});
