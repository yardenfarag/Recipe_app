import { readdirSync } from 'node:fs';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

// New migrations are stamped with a UTC timestamp (`npx supabase migration new <name>`),
// so two branches can't claim the same number. 0001-0043 keep their old numbers.
const LAST_NUMBERED = 43;
const NUMBERED = /^(\d{4})_[a-z0-9_]+\.sql$/;
const STAMPED = /^(\d{14})_[a-z0-9_]+\.sql$/;

const files = readdirSync(join(import.meta.dirname, '..', 'supabase/migrations')).filter((f) =>
  f.endsWith('.sql'),
);

function version(file) {
  return (NUMBERED.exec(file) ?? STAMPED.exec(file))?.[1];
}

describe('supabase migrations', () => {
  it('are named <version>_<snake_case>.sql', () => {
    expect(files.filter((f) => !version(f))).toEqual([]);
  });

  it(`stop using 4-digit numbers after ${String(LAST_NUMBERED).padStart(4, '0')}`, () => {
    const late = files.filter((f) => NUMBERED.test(f) && Number(NUMBERED.exec(f)[1]) > LAST_NUMBERED);
    expect(late, 'create new migrations with `npx supabase migration new <name>`').toEqual([]);
  });

  it('use real UTC timestamps', () => {
    const bad = files.filter((f) => {
      const stamp = STAMPED.exec(f)?.[1];
      if (!stamp) return false;
      const [y, mo, d, h, mi, s] = stamp.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/).slice(1);
      const date = new Date(`${y}-${mo}-${d}T${h}:${mi}:${s}Z`);
      return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 19) !== `${y}-${mo}-${d}T${h}:${mi}:${s}`;
    });
    expect(bad).toEqual([]);
  });

  it('have unique versions', () => {
    const seen = new Map();
    for (const f of files) {
      const v = version(f);
      if (v) seen.set(v, [...(seen.get(v) ?? []), f]);
    }
    expect([...seen.values()].filter((group) => group.length > 1)).toEqual([]);
  });
});
