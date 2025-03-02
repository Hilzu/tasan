export const getEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) throw new Error(`Missing env var: ${key}`);
  return value;
};

export const TableName = getEnv("TABLE_NAME");

export const reversedKeyIndexName = "GSI-SK-PK";
