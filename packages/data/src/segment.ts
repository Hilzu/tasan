import AWSXRay from "aws-xray-sdk-core";

export const captureAsync = <T, Args extends unknown[]>(
  name: string,
  fn: (...args: Args) => Promise<T>,
): ((...args: Args) => Promise<T>) => {
  const segment = AWSXRay.getSegment();
  return (...args) =>
    AWSXRay.captureAsyncFunc(
      name,
      async (subsegment) => {
        const start = Date.now();
        const res = await fn(...args);
        const duration = Date.now() - start;
        subsegment?.close();
        console.log("Captured async function done", { name, duration });
        return res;
      },
      segment,
    );
};
