export const compareById = (a: { id: string }, b: { id: string }) =>
  a.id.localeCompare(b.id);

export const compareByKey = (
  [key]: [string, unknown],
  [key2]: [string, unknown],
) => key.localeCompare(key2);
