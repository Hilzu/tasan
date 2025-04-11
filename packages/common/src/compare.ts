export const compareById = (a: { id: string }, b: { id: string }) =>
  a.id.localeCompare(b.id);

export const compareByTo = (a: { to: string }, b: { to: string }) =>
  a.to.localeCompare(b.to);

export const compareByKey = (
  [key]: [string, unknown],
  [key2]: [string, unknown],
) => key.localeCompare(key2);
