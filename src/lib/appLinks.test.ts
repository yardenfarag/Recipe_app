import { describe, expect, it } from 'vitest';

import { appPathForWebLink } from './appLinks';

describe('appPathForWebLink', () => {
  it('opens a shared recipe link on the share screen', () => {
    expect(appPathForWebLink('https://pinch-app.io/s/AbC_-123')).toBe('/s/AbC_-123');
    expect(appPathForWebLink('https://www.pinch-app.io/s/AbC_-123/')).toBe('/s/AbC_-123');
    expect(appPathForWebLink('https://pinch-app.io/app/s/AbC_-123?utm=x')).toBe('/s/AbC_-123');
  });

  it('opens a public Hub recipe page on the Hub screen', () => {
    expect(appPathForWebLink('https://pinch-app.io/r/honey-butter-cornbread-16dcf08bfa53')).toBe(
      '/hub/honey-butter-cornbread-16dcf08bfa53',
    );
    expect(appPathForWebLink('https://pinch-app.io/r/c160897a0a21/?utm_source=x')).toBe('/hub/c160897a0a21');
  });

  it('opens a household invite on the join screen', () => {
    expect(appPathForWebLink('https://pinch-app.io/app/join/AbCdEf_-1234567890')).toBe('/join/AbCdEf_-1234567890');
    expect(appPathForWebLink('https://www.pinch-app.io/join/AbCdEf_-1234567890/?utm=x')).toBe(
      '/join/AbCdEf_-1234567890',
    );
    expect(appPathForWebLink('https://pinch-app.io/app/join/')).toBe('/');
    expect(appPathForWebLink('https://pinch-app.io/app/join/a/b')).toBe('/');
  });

  it('sends other pinch-app.io pages to the library', () => {
    expect(appPathForWebLink('https://pinch-app.io/guides/save-tiktok/')).toBe('/');
  });

  it('leaves app paths and other URLs alone', () => {
    expect(appPathForWebLink('/s/AbC')).toBe('/s/AbC');
    expect(appPathForWebLink('pinch://s/AbC')).toBe('pinch://s/AbC');
    expect(appPathForWebLink('https://evil.example/s/AbC')).toBe('https://evil.example/s/AbC');
  });
});
