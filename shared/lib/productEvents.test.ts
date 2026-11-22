import { describe, expect, it } from 'vitest';

import { recipePlatformProperty } from './productEvents';

describe('recipePlatformProperty', () => {
  it('keeps the platform the server gave the recipe', () => {
    expect(recipePlatformProperty('pinterest')).toBe('pinterest');
    expect(recipePlatformProperty('instagram')).toBe('instagram');
  });

  it('says unknown when there is none', () => {
    expect(recipePlatformProperty(undefined)).toBe('unknown');
    expect(recipePlatformProperty(null)).toBe('unknown');
    expect(recipePlatformProperty('  ')).toBe('unknown');
  });
});
