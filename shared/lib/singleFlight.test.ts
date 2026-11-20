import { describe, expect, it, vi } from 'vitest';

import { runSingleFlight } from './singleFlight';

describe('runSingleFlight', () => {
  it('shares an active task and allows a later retry', async () => {
    const flights = new Map<string, Promise<number>>();
    let resolve!: (value: number) => void;
    const task = vi.fn(
      () =>
        new Promise<number>((done) => {
          resolve = done;
        }),
    );

    const first = runSingleFlight(flights, 'user-1', task);
    const overlapping = runSingleFlight(flights, 'user-1', task);

    expect(overlapping).toBe(first);
    expect(task).toHaveBeenCalledTimes(1);
    resolve(3);
    await expect(first).resolves.toBe(3);

    const retry = runSingleFlight(flights, 'user-1', async () => 4);
    await expect(retry).resolves.toBe(4);
  });

  it('clears a rejected task so it can be retried', async () => {
    const flights = new Map<string, Promise<void>>();

    await expect(
      runSingleFlight(flights, 'user-1', async () => {
        throw new Error('failed');
      }),
    ).rejects.toThrow('failed');

    await expect(runSingleFlight(flights, 'user-1', async () => undefined)).resolves.toBeUndefined();
  });
});
