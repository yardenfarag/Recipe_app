/**
 * Reuse the active promise for a key and remove it only after that exact task
 * settles. This prevents overlapping callers without caching completed work.
 */
export function runSingleFlight<Key, Result>(
  flights: Map<Key, Promise<Result>>,
  key: Key,
  task: () => Promise<Result>,
): Promise<Result> {
  const active = flights.get(key);
  if (active) return active;

  const flight = task().finally(() => {
    if (flights.get(key) === flight) flights.delete(key);
  });
  flights.set(key, flight);
  return flight;
}
