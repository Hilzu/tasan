import { createContext, useContext } from "react";

export const NonceContext = createContext<string | undefined>(undefined);

export const LanguageContext = createContext<string | undefined>(undefined);
export const useLanguage = () => useContext(LanguageContext);

export const TimeZoneContext = createContext<string | undefined>(undefined);
export const useTimeZone = () => useContext(TimeZoneContext);
