import { AsyncLocalStorage } from "node:async_hooks";

import { Logger } from "@aws-lambda-powertools/logger";

const logger = new Logger({ serviceName: "tasan" });
const context = new AsyncLocalStorage<{
  logger: Logger;
  errors: WeakSet<object>;
}>();

export const getLogger = (): Logger => context.getStore()?.logger ?? logger;

/** Child loggers keep concurrent requests and nested actions isolated. */
export const withLogContext = <T>(
  attributes: Record<string, unknown>,
  fn: () => T,
): T =>
  context.run(
    {
      logger: getLogger().createChild({ persistentKeys: attributes }),
      errors: context.getStore()?.errors ?? new WeakSet<object>(),
    },
    fn,
  );

/** React Router can report the same error after an action has logged it. */
export const logError = (message: string, error: unknown): void => {
  const errors = context.getStore()?.errors;
  if (typeof error === "object" && error !== null) {
    if (errors?.has(error)) return;
    errors?.add(error);
  }
  getLogger().error(message, { error });
};
