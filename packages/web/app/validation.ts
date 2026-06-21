import { data } from "react-router";
import { flattenError, type z } from "zod";

export function validateOrRespond<T extends z.ZodType>(
  schema: T,
  formData: FormData,
) {
  const result = schema.safeParse(formData);
  if (result.success) return { data: result.data };
  const errors = flattenError<z.output<typeof schema>>(result.error);
  return { response: data({ errors }, { status: 400 }) };
}
