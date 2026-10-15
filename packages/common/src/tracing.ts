import { getLogger } from "./logging.js";

export const captureAsync = <T, Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<T>,
): ((...args: Args) => Promise<T>) => {
  return async function _captureAsync(...args) {
    const start = performance.now();
    try {
      return await fn(...args);
    } finally {
      getLogger().debug("Operation finished", {
        operation: name,
        durationMs: Math.round(performance.now() - start),
      });
    }
  };
};
