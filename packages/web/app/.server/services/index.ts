import { fetchCurrencyConversionRate } from "@tasan/common/currency-convert";
import * as persistence from "@tasan/data";

import { createApplication } from "./application";

// Production composition root. Tests import the factory instead, so importing
// use cases never initializes AWS clients or reads environment configuration.
export const application = createApplication({
  ...persistence,
  fetchCurrencyConversionRate,
  now: () => new Date(),
});
