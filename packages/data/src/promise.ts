/**
 * Prevents multiple concurrent calls to the same function with the same arguments.
 * @param fn
 */
export const memoizeSingleFlight = <Res, Args extends unknown[]>(
  fn: (...args: Args) => Promise<Res>,
) => {
  const cache = new Map<string, Promise<Res>>();

  return async function _memoize(...args: Args) {
    const key = JSON.stringify(args);
    let promise = cache.get(key);
    if (!promise) {
      promise = fn(...args);
      cache.set(key, promise);
    }
    const res = await promise;
    cache.delete(key);
    return res;
  };
};
