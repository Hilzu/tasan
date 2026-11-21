// Sanitize URL to always be a relative path.
export const toRelativePath = (url: string): string => {
  const baseURL = new URL("http://localhost");
  const toURL = new URL(url, baseURL);
  if (toURL.origin !== baseURL.origin || toURL.pathname.startsWith("//"))
    return "/";
  return toURL.pathname + toURL.search;
};
