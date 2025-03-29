import { createContext } from "react";

export const NonceContext = createContext<string | undefined>(undefined);

export const LanguageContext = createContext<string | undefined>(undefined);
