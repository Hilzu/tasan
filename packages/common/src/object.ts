export const mapObjectValues = <T, U>(
  obj: Record<string, T>,
  fn: (value: T, key: string) => U,
): Record<string, U> => {
  const result: Record<string, U> = {};
  for (const key in obj) {
    result[key] = fn(obj[key], key);
  }
  return result;
};
