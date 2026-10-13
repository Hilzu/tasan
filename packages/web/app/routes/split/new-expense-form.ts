import {
  currencySymbolSchema,
  expenseIDSchema,
  userIDSchema,
} from "@tasan/common/validation";
import { z } from "zod";
import { zfd } from "zod-form-data";

// Decode transport values without rounding them or accepting a home currency.
// Membership, precision, and totals are validated by the application use case.
export const newExpenseFormSchema = zfd.formData({
  expenseID: zfd.text(expenseIDSchema),
  expenseName: zfd.text(),
  currency: zfd.text(currencySymbolSchema),
  amount: zfd.numeric(),
  payer: zfd.text(userIDSchema),
  participants: z.record(userIDSchema, zfd.numeric()).default({}),
});
