import { useEffect, useState } from "react";

import { createStorage, type StorableValue } from "~/.client/client-utils";

const isBrowser = typeof window !== "undefined";

export const useStorage = <T extends StorableValue>(
  key: string,
  initialValue?: T,
) => {
  // eslint-disable-next-line @typescript-eslint/no-empty-function
  if (!isBrowser) return [initialValue ?? null, () => {}] as const;
  const { get, set, del } = createStorage<T>(key);
  const [value, setValue] = useState<T | null>(get());
  useEffect(() => {
    if (value === null) del();
    else set(value);
  }, [value]);
  return [value, setValue] as const;
};
