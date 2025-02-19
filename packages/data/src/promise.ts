export const cachePromise = <Res, Args extends unknown[]>(
  fn: (...args: Args) => Promise<Res>,
) => {
  const cache = new Map<string, Promise<Res>>();

  return function _cachePromise(...args: Args) {
    const key = JSON.stringify(args);
    let promise = cache.get(key);
    if (!promise) {
      promise = fn(...args);
      cache.set(key, promise);
    }
    return promise;
  };
};
