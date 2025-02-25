const getEnv = (key: string, fallback?: string): string => {
  const value = process.env[key];
  if (value) return value;
  if (fallback) return fallback;
  throw new Error(`Missing environment variable: ${key}`);
};

export const originURL = new URL(getEnv("ORIGIN_URL"));

export const authServerURL = new URL(getEnv("AUTH_SERVER_URL"));

export const authClientID = getEnv("AUTH_CLIENT_ID");

// The deployment environment, e.g. "staging" or "production"
export const appEnv = getEnv("APP_ENV", "local") as "local" | "production";
