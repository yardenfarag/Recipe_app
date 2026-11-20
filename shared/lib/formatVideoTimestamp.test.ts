import { describe, expect, it } from 'vitest';

import { formatVideoTimestamp } from './formatVideoTimestamp';

describe('formatVideoTimestamp', () => {
  it('formats sub-hour times', () => {
    expect(formatVideoTimestamp(0)).toBe('0:00');
    expect(formatVideoTimestamp(14)).toBe('0:14');
    expect(formatVideoTimestamp(134)).toBe('2:14');
  });

  it('formats hour-plus times', () => {
    expect(formatVideoTimestamp(3661)).toBe('1:01:01');
  });

  it('returns empty for invalid input', () => {
    expect(formatVideoTimestamp(-1)).toBe('');
  });
});
