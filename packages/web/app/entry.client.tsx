import { startTransition, StrictMode } from "react";
import { hydrateRoot } from "react-dom/client";
import { HydratedRouter } from "react-router/dom";

import { LanguageContext } from "~/context";

startTransition(() => {
  hydrateRoot(
    document,
    <StrictMode>
      <LanguageContext.Provider value={navigator.language}>
        <HydratedRouter />
      </LanguageContext.Provider>
    </StrictMode>,
  );
});
