import { data } from "react-router";

import { ApplicationError } from "./errors";

export const runApplication = async <T>(
  useCase: () => Promise<T>,
): Promise<T> => {
  try {
    return await useCase();
  } catch (error) {
    if (!(error instanceof ApplicationError)) throw error;
    const status =
      error.code === "not_found" ? 404
      : error.code === "forbidden" ? 403
      : 400;
    throw new Response(error.message, { status });
  }
};

export const runFormApplication = async <T>(useCase: () => Promise<T>) => {
  return runApplication(async () => {
    try {
      return { value: await useCase() };
    } catch (error) {
      if (
        !(error instanceof ApplicationError) ||
        error.code !== "invalid_input"
      )
        throw error;
      return {
        response: data(
          {
            errors: {
              formErrors:
                Object.keys(error.fieldErrors).length ? [] : [error.message],
              fieldErrors: error.fieldErrors,
            },
          },
          { status: 400 },
        ),
      };
    }
  });
};
