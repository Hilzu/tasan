import { data } from "react-router";
import type { z } from "zod";
import type { inferFlattenedErrors } from "zod";

export function validateOrRespond<T extends z.ZodTypeAny>(
  schema: T,
  formData: FormData,
) {
  const result = schema.safeParse(formData);
  if (result.success) return { data: result.data as z.infer<T> };
  const errors = result.error.flatten() as inferFlattenedErrors<typeof schema>;
  return { response: data({ errors }, { status: 400 }) };
}
