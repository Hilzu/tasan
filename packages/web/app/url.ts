// Sanitize URL to always be a relative path.
export const toRelativePath = (url: string): string => {
  const toURL = new URL(url, "http://localhost");
  return toURL.pathname + toURL.search;
};
