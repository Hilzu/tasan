import { useLanguage, useTimeZone } from "~/context";

interface DateRenderProps {
  date: Date;
}

export function DateRender({ date }: DateRenderProps) {
  const language = useLanguage();
  const timeZone = useTimeZone();
  return <span>{date.toLocaleString(language, { timeZone })}</span>;
}
