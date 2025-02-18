export const compareById = (a: { id: string }, b: { id: string }) =>
  a.id.localeCompare(b.id);
