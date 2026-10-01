import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { LanguageContext, NonceContext } from "~/context";

// Browsers hide nonce attributes; read the DOM property instead.
const nonce = document.querySelector<HTMLScriptElement>("script[nonce]")?.nonce;

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <NonceContext.Provider value={nonce}>
        <LanguageContext.Provider value={navigator.language}>
          <HydratedRouter />
        </LanguageContext.Provider>
      </NonceContext.Provider>
    </StrictMode>,
  );
});
