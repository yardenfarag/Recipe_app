import { describe, expect, it } from 'vitest';

import { formatCountdown, parseStepTimers } from './stepTimers';

describe('parseStepTimers', () => {
  it('finds minute and second cues and ignores ingredient amounts', () => {
    const timers = parseStepTimers('Simmer 10 minutes, then rest 30 seconds. Add 2 cups flour.');
    expect(timers.map((row) => row.seconds)).toEqual([600, 30]);
  });

  it('understands Hebrew and Spanish time words', () => {
    expect(parseStepTimers('לבשל 8 דקות')[0]?.seconds).toBe(480);
    expect(parseStepTimers('hornea 12 minutos')[0]?.seconds).toBe(720);
  });

  it('skips tiny or huge spans', () => {
    expect(parseStepTimers('wait 2 seconds')).toEqual([]);
    expect(parseStepTimers('proof 10 hours')).toEqual([]);
    expect(parseStepTimers('proof 2 hours')[0]?.seconds).toBe(7200);
  });
});

describe('formatCountdown', () => {
  it('renders m:ss and h:mm:ss', () => {
    expect(formatCountdown(75)).toBe('1:15');
    expect(formatCountdown(3661)).toBe('1:01:01');
  });
});
