import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import {
  asSplitID,
  asUserID,
  genExpenseID,
  type UserID,
} from "@tasan/common/id";
import { currencySymbolSchema } from "@tasan/common/validation";
import { useEffect, useLayoutEffect, useState } from "react";
import { href, redirect, useFetcher, useRouteLoaderData } from "react-router";

import { authenticatedSessionContext } from "~/.server/auth";
import { createExpense } from "~/.server/services/expenses";
import { formErrorResponse } from "~/.server/services/http";
import { Button } from "~/components/button";
import {
  type AmountInput,
  CheckboxGroupField,
  CurrencyInputField,
  emptyAmountInput,
  FieldError,
  InputField,
  normalizeAmountInput,
  RadioGroupField,
  resolveAmount,
  SelectField,
} from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { useStorage } from "~/hooks";
import { calculateExpenseAmounts } from "~/routes/split/expense-amounts";
import { newExpenseFormSchema } from "~/routes/split/new-expense-form";
import type { SplitLoader } from "~/routes/split/split-parent";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/new-expense";

export async function action({ request, params, context }: Route.ActionArgs) {
  const session = context.get(authenticatedSessionContext);

  const splitID = asSplitID(params.splitID);
  const formData = await request.formData();
  const result = validateOrRespond(newExpenseFormSchema, formData);
  if (result.response) return result.response;
  const { data } = result;

  const participants = new Map(
    Object.entries(data.participants).map(([k, v]) => [asUserID(k), v]),
  );
  try {
    await createExpense(session.userID, splitID, {
      id: data.expenseID,
      name: data.expenseName,
      currency: data.currency,
      amount: data.amount,
      payer: data.payer,
      participants,
    });
    return redirect(href("/splits/:splitID", { splitID }));
  } catch (error) {
    return formErrorResponse(error, { name: "expenseName" });
  }
}

export default function NewExpense(_: Route.ComponentProps) {
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, session } = parentData;
  const fetcher = useFetcher<typeof action>();
  const actionData = fetcher.data;
  const [expenseID, setExpenseID] = useState("");
  useEffect(() => {
    setExpenseID(genExpenseID());
  }, [split.id, session.userID]);
  const [preferredCurrency, setPreferredCurrency] =
    useStorage<CurrencySymbol>("preferredCurrency");
  const [currency, setCurrency] = useState(split.currency);
  const fractionDigits = currencies[currency].fractions;
  const [total, setTotal] = useState(emptyAmountInput);
  const [payer, setPayer] = useState(session.userID);
  const [participants, setParticipants] = useState(
    () =>
      new Map<UserID, AmountInput>(
        users.map(({ id }) => [id, emptyAmountInput]),
      ),
  );
  useLayoutEffect(() => {
    if (preferredCurrency) setCurrency(preferredCurrency);
  }, []);
  const amount = resolveAmount(
    total.text,
    total.expressionMode,
    fractionDigits,
  );
  const calculated = calculateExpenseAmounts(
    amount,
    new Map(
      [...participants].map(([id, input]) => [
        id,
        resolveAmount(input.text, input.expressionMode, fractionDigits),
      ]),
    ),
    fractionDigits,
    payer,
  );
  const amountError =
    calculated.hasAmounts && !D.gt(calculated.amount, 0) ?
      "Enter a positive total or participant amounts."
    : undefined;
  const allocationError =
    D.gt(calculated.difference, 0) ?
      `${currency} ${D.toString(calculated.difference)} left to allocate.`
    : D.gt(D.create(0, fractionDigits), calculated.difference) ?
      `Participant amounts exceed total by ${currency} ${D.toString(D.mul(calculated.difference, -1))}.`
    : undefined;

  return (
    <div>
      <MainHeading>New expense for {split.name}</MainHeading>
      <fetcher.Form
        method="post"
        className="max-w-md space-y-2"
        onSubmit={(event) => {
          if (!calculated.valid) event.preventDefault();
        }}
      >
        <input type="hidden" name="expenseID" value={expenseID} />
        <InputField
          label="Name"
          name="expenseName"
          autoComplete="off"
          required
          minLength={1}
          maxLength={64}
          errors={actionData?.errors.fieldErrors.expenseName}
        />

        <SelectField
          label="Currency"
          name="currency"
          required
          errors={actionData?.errors.fieldErrors.currency}
          value={currency}
          onChange={(event) => {
            const currency = currencySymbolSchema.parse(event.target.value);
            const fractions = currencies[currency].fractions;
            setTotal((input) => normalizeAmountInput(input, fractions));
            setParticipants(
              (inputs) =>
                new Map(
                  [...inputs].map(([id, input]) => [
                    id,
                    normalizeAmountInput(input, fractions),
                  ]),
                ),
            );
            setCurrency(currency);
            setPreferredCurrency(currency);
          }}
        >
          {Object.entries(currencies).map(([symbol, currency]) => (
            <option key={symbol} value={symbol}>
              {currency.name} ({symbol})
            </option>
          ))}
        </SelectField>

        <CurrencyInputField
          label="Total"
          automaticAmount={
            calculated.hasAmounts ? calculated.amount : undefined
          }
          placeholder={
            calculated.hasAmounts && amount === undefined ?
              D.toString(calculated.amount)
            : undefined
          }
          name="amount"
          value={total}
          onValueChange={setTotal}
          currencySymbol={currency}
          description={
            amount === undefined && calculated.hasAmounts ?
              `Calculated total: ${currency} ${D.toString(calculated.amount)}. Enter a total to split the remainder equally.`
            : "Enter a total or individual amounts. Clear the total to calculate it from individual amounts."
          }
          errors={[
            ...(actionData?.errors.fieldErrors.amount ?? []),
            ...(amountError ? [amountError] : []),
          ]}
        />

        <RadioGroupField
          label="Payer"
          inline
          items={users.map((u) => ({
            value: u.id,
            label: u.name,
            name: "payer",
            checked: u.id === payer,
            onChange: () => {
              setPayer(u.id);
            },
          }))}
          errors={actionData?.errors.fieldErrors.payer}
        />

        <CheckboxGroupField
          label="Participants"
          description="Remove anyone who does not owe an amount."
          inline
          items={users.map((u) => ({
            value: u.id,
            label: u.name,
            checked: participants.has(u.id),
            onChange: (event) => {
              setParticipants((prev) => {
                const newMap = new Map(prev);
                if (event.target.checked) newMap.set(u.id, emptyAmountInput);
                else newMap.delete(u.id);
                return newMap;
              });
            },
          }))}
        />

        {[...participants.entries()].map(([userID, input]) => (
          <CurrencyInputField
            key={userID}
            currencySymbol={currency}
            label={`${users.find((u) => u.id === userID)?.name ?? "Unknown"} amount`}
            name={`participants.${userID}`}
            errors={
              calculated.hasAmounts && calculated.invalidAmounts.has(userID) ?
                ["Enter a positive amount or remove this participant."]
              : undefined
            }
            automaticAmount={calculated.participants.get(userID)}
            placeholder={
              input.text.trim() === "" && calculated.hasAmounts ?
                D.toString(
                  calculated.participants.get(userID) ??
                    D.create(0, fractionDigits),
                )
              : undefined
            }
            description={
              input.text.trim() === "" ?
                amount === undefined ?
                  "Enter an amount, or set a total for equal sharing."
                : "Remainder split equally. Enter an amount to override."
              : "Specific amount. Clear to return to automatic calculation."
            }
            value={input}
            onValueChange={(input) => {
              setParticipants((prev) => new Map(prev).set(userID, input));
            }}
          />
        ))}
        {actionData?.errors.fieldErrors.participants && (
          <FieldError errors={actionData.errors.fieldErrors.participants} />
        )}
        {allocationError && <FieldError errors={[allocationError]} />}
        {participants.size === 0 && (
          <FieldError errors={["Select at least one participant."]} />
        )}

        <Button
          type="submit"
          className="mt-2"
          disabled={fetcher.state !== "idle" || !expenseID || !calculated.valid}
        >
          {fetcher.state === "submitting" ? "Creating..." : "Create"}
        </Button>
        {actionData?.errors.formErrors && (
          <FieldError errors={actionData.errors.formErrors} />
        )}
      </fetcher.Form>
    </div>
  );
}
