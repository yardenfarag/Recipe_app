import { describe, expect, it } from 'vitest';

import { parseLlmJsonText } from '@/lib/llmJson';

describe('parseLlmJsonText', () => {
  it('returns trimmed JSON', () => {
    expect(parseLlmJsonText('  {"a":1}  ')).toBe('{"a":1}');
  });

  it('unwraps a json fence', () => {
    expect(parseLlmJsonText('```json\n{"a":1}\n```')).toBe('{"a":1}');
  });

  it('unwraps a bare fence', () => {
    expect(parseLlmJsonText('```\n{"a":1}\n```')).toBe('{"a":1}');
  });
});
