import { expenseIDSchema } from "@tasan/common/validation";
import { z } from "zod";

const entriesSchema = z.array(z.tuple([z.string(), z.string()]));

export const encodePendingExpense = (form: FormData): string =>
  JSON.stringify([...form.entries()]);

export const decodePendingExpense = (value: string): FormData => {
  const form = new FormData();
  for (const [key, entry] of entriesSchema.parse(JSON.parse(value)))
    form.append(key, entry);
  expenseIDSchema.parse(form.get("expenseID"));
  return form;
};
