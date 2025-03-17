import AWSXRay from "aws-xray-sdk-core";

export const captureAsync = <T, Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<T>,
): ((...args: Args) => Promise<T>) => {
  return function _captureAsync(...args) {
    return AWSXRay.captureAsyncFunc(
      name,
      async function _capturedAsyncFn(subsegment) {
        const start = Date.now();
        const res = await fn(...args);
        const duration = Date.now() - start;
        subsegment?.close();
        console.log("Captured async function done", { name, duration });
        return res;
      },
    );
  };
};
