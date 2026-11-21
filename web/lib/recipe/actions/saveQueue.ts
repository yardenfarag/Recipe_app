/**
 * Runs saves one after another, so an earlier answer never lands after a later change. A failed save doesn't stop
 * the ones after it.
 */
export type SaveQueue = { run: <T>(task: () => Promise<T>) => Promise<T> };

export function createSaveQueue(): SaveQueue {
  let tail: Promise<unknown> = Promise.resolve();
  return {
    run<T>(task: () => Promise<T>): Promise<T> {
      const result = tail.then(task, task);
      tail = result.catch(() => undefined);
      return result;
    },
  };
}
