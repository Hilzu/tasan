export const captureAsync = <T, Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<T>,
): ((...args: Args) => Promise<T>) => {
  return async function _captureAsync(...args) {
    const start = Date.now();
    const res = await fn(...args);
    const duration = Date.now() - start;
    console.log("Captured async function done", { name, duration });
    return res;
  };
};
