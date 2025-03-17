export const copyToClipboard = async (text: string) => {
  await navigator.clipboard.writeText(text);
};

export const canShare = (data: ShareData) => {
  if (!("canShare" in navigator)) return false;
  return navigator.canShare(data);
};

export const createShareHandler = (data: ShareData) => () => {
  navigator
    .share(data)
    .then(() => {
      console.log("Shared successfully");
    })
    .catch((error: unknown) => {
      console.error("Error sharing", error);
    });
};

export const createStorage = <T extends NonNullable<unknown>>(key: string) => ({
  get: (): T | null => {
    try {
      const value = localStorage.getItem(key);
      return value ? (JSON.parse(value) as T) : null;
    } catch (e) {
      console.error(`Unable to get item ${key} from local storage`, e);
      return null;
    }
  },
  set: (value: T) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      console.error(`Unable to set item ${key} to local storage`, e);
    }
  },
  del: () => {
    try {
      localStorage.removeItem(key);
    } catch (e) {
      console.error(`Unable to delete item ${key} from local storage`, e);
    }
  },
});
