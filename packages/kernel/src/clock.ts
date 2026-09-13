/** Wall clock in unix milliseconds. Injected everywhere so tests are deterministic. */
export type Clock = () => number;

export const systemClock: Clock = () => Date.now();

/**
 * Monotonic wrapper (Implementation Requirement 1: clock must not move backward).
 * If the underlying clock steps backwards the last value is returned instead.
 */
export function monotonic(base: Clock = systemClock): Clock {
  let last = -Infinity;
  return () => {
    const t = base();
    if (t < last) return last;
    last = t;
    return t;
  };
}
