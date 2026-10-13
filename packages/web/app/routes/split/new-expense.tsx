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

import { getSessionOrRedirect } from "~/.server/auth";
import { createExpense } from "~/.server/services/expenses";
import { formErrorResponse } from "~/.server/services/http";
import { Button } from "~/components/button";
import {
  CheckboxGroupField,
  CurrencyInputField,
  FieldError,
  InputField,
  RadioGroupField,
  SelectField,
} from "~/components/formField";
import { MainHeading } from "~/components/heading";
import { useStorage } from "~/hooks";
import { calculateExpenseAmounts } from "~/routes/split/expense-amounts";
import { newExpenseFormSchema } from "~/routes/split/new-expense-form";
import type { SplitLoader } from "~/routes/split/split-parent";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/new-expense";

export async function action({ request, params, url }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request, url);
  if (session instanceof Response) return session;

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
  const [amount, setAmount] = useState<D.Decimal>();
  const [payer, setPayer] = useState(session.userID);
  const [participants, setParticipants] = useState(
    () =>
      new Map<UserID, D.Decimal | undefined>(
        users.map(({ id }) => [id, undefined]),
      ),
  );
  useLayoutEffect(() => {
    if (preferredCurrency) setCurrency(preferredCurrency);
  }, []);
  const calculated = calculateExpenseAmounts(
    amount,
    participants,
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

  const canSubmit =
    calculated.hasAmounts &&
    D.gt(calculated.amount, 0) &&
    allocationError === undefined &&
    participants.size > 0 &&
    calculated.invalidAmounts.size === 0;

  return (
    <div>
      <MainHeading>New expense for {split.name}</MainHeading>
      <fetcher.Form
        method="post"
        className="max-w-md space-y-2"
        onSubmit={(event) => {
          if (!canSubmit) event.preventDefault();
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
          onDecimalChange={(decimal) => {
            setAmount(decimal);
          }}
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
                if (event.target.checked) newMap.set(u.id, undefined);
                else newMap.delete(u.id);
                return newMap;
              });
            },
          }))}
        />

        {[...participants.entries()].map(([userID, participantAmount]) => (
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
              participantAmount === undefined && calculated.hasAmounts ?
                D.toString(
                  calculated.participants.get(userID) ??
                    D.create(0, fractionDigits),
                )
              : undefined
            }
            description={
              participantAmount === undefined ?
                amount === undefined ?
                  "Enter an amount, or set a total for equal sharing."
                : "Remainder split equally. Enter an amount to override."
              : "Specific amount. Clear to return to automatic calculation."
            }
            onDecimalChange={(decimal) => {
              setParticipants((prev) => new Map(prev).set(userID, decimal));
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
          disabled={fetcher.state !== "idle" || !expenseID || !canSubmit}
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
