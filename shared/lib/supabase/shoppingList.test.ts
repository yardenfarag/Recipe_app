import { beforeEach, describe, expect, it, vi } from 'vitest';

import type { ShoppingListItem } from '../../types/shoppingList';
import { syncMergedShoppingList } from './shoppingList';

const mocks = vi.hoisted(() => {
  const calls: { op: string; id?: string; row?: Record<string, unknown> }[] = [];
  const gone = new Set<string>();
  const from = vi.fn(() => ({
    insert: (row: Record<string, unknown>) => ({
      select: () => ({
        single: async () => {
          calls.push({ op: 'insert', row });
          return { data: { id: `new-${String(row.name)}`, ...row, created_at: 'c' }, error: null };
        },
      }),
    }),
    update: (row: Record<string, unknown>) => ({
      eq: (_column: string, id: string) => ({
        select: () => ({
          single: async () => {
            calls.push({ op: 'update', id, row });
            if (gone.has(id)) return { data: null, error: { code: 'PGRST116', message: 'no rows' } };
            return { data: { id, ...row, created_at: 'c' }, error: null };
          },
        }),
      }),
    }),
    delete: () => ({
      eq: async (_column: string, id: string) => {
        calls.push({ op: 'delete', id });
        return { error: null };
      },
    }),
  }));
  return { calls, gone, from };
});

vi.mock('./client', () => ({ supabase: { from: mocks.from } }));

function line(id: string, overrides: Partial<ShoppingListItem> = {}): ShoppingListItem {
  return {
    id,
    name: id,
    quantity: 1,
    unit: null,
    checked: false,
    created_at: '2026-11-26T00:00:00.000Z',
    updated_at: '2026-11-26T00:00:00.000Z',
    ...overrides,
  };
}

beforeEach(() => {
  mocks.calls.length = 0;
  mocks.gone.clear();
});

describe('syncMergedShoppingList', () => {
  it('writes only the lines the merge changed, so other members\' ticks are not overwritten', async () => {
    const previous = [line('a'), line('b'), line('c')];
    const next = [line('a'), line('b', { quantity: 3, updated_at: '2026-11-26T01:00:00.000Z' }), line('list-1', { name: 'eggs' })];
    const saved = await syncMergedShoppingList('me', previous, next);
    expect(mocks.calls.map((c) => `${c.op}:${c.id ?? c.row?.name}`)).toEqual(['delete:c', 'update:b', 'insert:eggs']);
    expect(saved.map((item) => item.id)).toEqual(['a', 'b', 'new-eggs']);
  });

  it('adds a changed line again when someone deleted it meanwhile, and carries on', async () => {
    mocks.gone.add('b');
    const previous = [line('b'), line('d')];
    const next = [line('b', { quantity: 2 }), line('d', { checked: true })];
    const saved = await syncMergedShoppingList('me', previous, next);
    expect(mocks.calls.map((c) => `${c.op}:${c.id ?? c.row?.name}`)).toEqual(['update:b', 'insert:b', 'update:d']);
    expect(saved.map((item) => item.id)).toEqual(['new-b', 'd']);
  });

  it('still fails on any other error', async () => {
    mocks.from.mockImplementationOnce(() => ({
      update: () => ({
        eq: () => ({ select: () => ({ single: async () => ({ data: null, error: { code: '42501', message: 'denied' } }) }) }),
      }),
    }) as never);
    await expect(syncMergedShoppingList('me', [line('a')], [line('a', { checked: true })])).rejects.toMatchObject({
      code: '42501',
    });
  });
});
