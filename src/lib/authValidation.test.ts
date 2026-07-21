import { describe, expect, it } from 'vitest';

import {
  getPasswordStrength,
  isValidEmail,
  normalizeEmail,
  validatePassword,
} from '@/lib/authValidation';

describe('email validation', () => {
  it('normalizes and accepts ordinary email addresses', () => {
    expect(normalizeEmail('  Chef@Example.COM ')).toBe('chef@example.com');
    expect(isValidEmail('chef+pinch@example.co.uk')).toBe(true);
  });

  it('rejects malformed email addresses', () => {
    expect(isValidEmail('chef@example')).toBe(false);
    expect(isValidEmail('chef example.com')).toBe(false);
    expect(isValidEmail('@example.com')).toBe(false);
  });
});

describe('password validation', () => {
  it('requires at least eight characters, a letter, and a number', () => {
    expect(validatePassword('short1')).toBeTruthy();
    expect(validatePassword('12345678')).toBeTruthy();
    expect(validatePassword('abcdefgh')).toBeTruthy();
    expect(validatePassword('recipe88')).toBeNull();
  });

  it('scores stronger passwords without making symbols mandatory', () => {
    expect(getPasswordStrength('recipe88')).toBe('good');
    expect(getPasswordStrength('RecipeBook8!')).toBe('strong');
  });
});
