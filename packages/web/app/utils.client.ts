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
