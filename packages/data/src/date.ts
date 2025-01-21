export const toUnixTime = (date: Date) => Math.floor(date.getTime() / 1000);

export const fromUnixTime = (unixTime: number) => new Date(unixTime * 1000);
