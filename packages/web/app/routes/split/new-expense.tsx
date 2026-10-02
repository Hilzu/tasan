import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import { asSplitID, asUserID } from "@tasan/common/id";
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
  const [preferredCurrency, setPreferredCurrency] =
    useStorage<CurrencySymbol>("preferredCurrency");
  const [currency, setCurrency] = useState(split.currency);
  const fractionDigits = currencies[currency].fractions;
  const [amount, setAmount] = useState(D.create(0, fractionDigits));
  const [participantCount, setParticipantCount] = useState(users.length);
  const [participants, setParticipants] = useState(
    () => new Map(users.map(({ id }) => [id, D.create(0, fractionDigits)])),
  );
  useLayoutEffect(() => {
    if (preferredCurrency) setCurrency(preferredCurrency);
  }, []);
  useEffect(() => {
    setParticipants((prev) => {
      const participantAmount = D.div(amount, participantCount || 1);
      const total = D.mul(participantAmount, participantCount);
      const diff = D.sub(amount, total);
      const payerAmount = D.add(participantAmount, diff);
      return new Map(
        [...prev.keys()].map((userID) => [
          userID,
          userID === session.userID ? payerAmount : participantAmount,
        ]),
      );
    });
  }, [participantCount, amount]);
  const participantTotal = [...participants.values()].reduce((a, b) =>
    D.add(a, b),
  );

  return (
    <div>
      <MainHeading>New expense for {split.name}</MainHeading>
      <fetcher.Form method="post" className="max-w-md space-y-2">
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
          required
          label="Amount"
          name="amount"
          onDecimalChange={(decimal) => {
            setAmount(decimal);
          }}
          currencySymbol={currency}
          description="This will be divided equally among the participants when set."
          errors={actionData?.errors.fieldErrors.amount}
        />

        <RadioGroupField
          label="Payer"
          inline
          items={users.map((u) => ({
            value: u.id,
            label: u.name,
            name: "payer",
            defaultChecked: u.id === session.userID,
          }))}
          errors={actionData?.errors.fieldErrors.payer}
        />

        <CheckboxGroupField
          label="Participants"
          inline
          items={users.map((u) => ({
            value: u.id,
            label: u.name,
            checked: participants.has(u.id),
            onChange: (event) => {
              setParticipants((prev) => {
                const newMap = new Map(prev);
                if (event.target.checked)
                  newMap.set(u.id, D.create(0, fractionDigits));
                else newMap.delete(u.id);
                setParticipantCount(newMap.size);
                return newMap;
              });
            },
          }))}
        />

        {[...participants.entries()].map(([userID, amount]) => (
          <CurrencyInputField
            required
            key={userID}
            currencySymbol={currency}
            label={`${users.find((u) => u.id === userID)?.name ?? "Unknown"} amount`}
            name={`participants.${userID}`}
            value={amount}
            onDecimalChange={(decimal) => {
              setParticipants((prev) => new Map(prev).set(userID, decimal));
            }}
          />
        ))}
        {actionData?.errors.fieldErrors.participants && (
          <FieldError errors={actionData.errors.fieldErrors.participants} />
        )}
        {!D.equals(participantTotal, amount) && (
          <FieldError
            errors={[
              `Total amount must match the expense amount. Difference: ${D.toString(D.sub(participantTotal, amount))}`,
            ]}
          />
        )}

        <Button
          type="submit"
          className="mt-2"
          disabled={fetcher.state !== "idle"}
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
