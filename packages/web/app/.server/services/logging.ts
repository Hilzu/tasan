import { getLogger, logError, withLogContext } from "@tasan/common/logging";

import { ApplicationError } from "./errors";

export const logAction = <T>(
  action: string,
  attributes: Record<string, unknown>,
  fn: () => Promise<T>,
): Promise<T> =>
  withLogContext({ action, ...attributes }, async () => {
    const start = performance.now();
    getLogger().info("Action attempted", { outcome: "attempted" });
    try {
      const result = await fn();
      getLogger().info("Action completed", {
        outcome: "success",
        durationMs: Math.round(performance.now() - start),
      });
      return result;
    } catch (error) {
      if (error instanceof ApplicationError) {
        getLogger().info("Action rejected", {
          outcome: "rejected",
          errorCode: error.code,
          fields: Object.keys(error.fieldErrors),
        });
      } else {
        getLogger().appendKeys({ outcome: "failure" });
        logError("Action failed", error);
      }
      throw error;
    }
  });
