const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing environment variable: ${key}`);
  }
  return value;
};

export const cookieSignSecret = getEnv("COOKIE_SIGN_SECRET");

export const originURL = new URL(getEnv("ORIGIN_URL"));
