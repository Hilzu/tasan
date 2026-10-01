import { data } from "react-router";

import { ApplicationError } from "./errors";

export const errorResponse = (error: unknown) => {
  if (!(error instanceof ApplicationError)) throw error;
  const status =
    error.code === "not_found" ? 404
    : error.code === "forbidden" ? 403
    : 400;
  return new Response(error.message, { status });
};

export const formErrorResponse = (error: unknown) => {
  if (!(error instanceof ApplicationError) || error.code !== "invalid_input")
    throw errorResponse(error);
  return data(
    {
      errors: {
        formErrors:
          Object.keys(error.fieldErrors).length ? [] : [error.message],
        fieldErrors: error.fieldErrors,
      },
    },
    { status: 400 },
  );
};
