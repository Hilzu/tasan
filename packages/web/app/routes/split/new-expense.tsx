import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import { fetchCurrencyConversionRate } from "@tasan/common/currency-convert";
import * as Decimal from "@tasan/common/decimal";
import { mapObjectValues } from "@tasan/common/object";
import { currencySchema, currencySymbolSchema } from "@tasan/common/validation";
import { createSplitExpense, getSplitUser } from "@tasan/data";
import { useEffect, useLayoutEffect, useState } from "react";
import { Form, href, redirect, useRouteLoaderData } from "react-router";
import { z } from "zod";
import { zfd } from "zod-form-data";

import { getSessionOrRedirect } from "~/auth.server";
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
import type { SplitLoader } from "~/routes/split/split-parent";
import { validateOrRespond } from "~/validation";

import type { Route } from "./+types/new-expense";

const schema = zfd.formData(
  z
    .object({
      name: zfd.text(z.string().min(1).max(64)),
      currency: zfd.text(currencySymbolSchema),
      splitCurrency: zfd.text(currencySymbolSchema),
      amount: zfd.numeric(currencySchema),
      payer: zfd.text(z.string()),
    })
    .catchall(z.record(zfd.numeric(currencySchema)))
    .superRefine((data, ctx) => {
      const path = ["participants"];
      const code = z.ZodIssueCode.custom;

      // eslint-disable-next-line @typescript-eslint/no-unnecessary-condition
      if (!data.participants || Object.keys(data.participants).length === 0) {
        ctx.addIssue({
          code,
          path,
          message: "Participants are required.",
        });
        return;
      }
      const total = Object.values(data.participants).reduce((a, b) =>
        Decimal.add(a, b),
      );
      if (!Decimal.equals(total, data.amount)) {
        ctx.addIssue({
          code,
          path,
          message: "Total amount must match the expense amount.",
        });
      }
    }),
);

export async function action({ request, params }: Route.ActionArgs) {
  const session = await getSessionOrRedirect(request);
  if (session instanceof Response) return session;

  const splitUser = await getSplitUser({
    splitID: params.splitID,
    userID: session.userID,
  });
  if (!splitUser) return new Response(null, { status: 404 });

  const formData = await request.formData();
  const result = validateOrRespond(schema, formData);
  if (result.response) return result.response;
  const { data } = result;

  let conversionRate: number | undefined;
  if (data.currency !== data.splitCurrency) {
    conversionRate = await fetchCurrencyConversionRate(
      data.currency,
      data.splitCurrency,
    );
  }

  await createSplitExpense({
    splitID: splitUser.splitID,
    name: data.name,
    currency: data.currency,
    conversionRate,
    amount: data.amount.value,
    payer: data.payer,
    participants: mapObjectValues(data.participants, (v) => v.value),
    createdBy: splitUser.userID,
  });

  return redirect(href("/splits/:splitID", { splitID: splitUser.splitID }));
}

export default function NewExpense({ actionData }: Route.ComponentProps) {
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, session } = parentData;
  const [preferredCurrency, setPreferredCurrency] =
    useStorage<CurrencySymbol>("preferredCurrency");
  const [currency, setCurrency] = useState(split.currency);
  const fractionDigits = currencies[currency].fractions;
  const [amount, setAmount] = useState(Decimal.create(0, fractionDigits));
  const [participantCount, setParticipantCount] = useState(users.length);
  const [participants, setParticipants] = useState(
    () =>
      new Map(users.map(({ id }) => [id, Decimal.create(0, fractionDigits)])),
  );
  const [total, setTotal] = useState(Decimal.create(0, fractionDigits));
  useLayoutEffect(() => {
    if (preferredCurrency) setCurrency(preferredCurrency);
  }, []);
  useEffect(() => {
    setParticipants((prev) => {
      const newAmount = Decimal.div(amount, participantCount || 1);
      return new Map([...prev.keys()].map((userID) => [userID, newAmount]));
    });
  }, [participantCount, amount]);
  useEffect(() => {
    setTotal([...participants.values()].reduce((a, b) => Decimal.add(a, b)));
  }, [participants]);

  return (
    <div>
      <MainHeading>New expense for {split.name}</MainHeading>
      <Form method="post" className="max-w-md space-y-2">
        <InputField
          label="Name"
          name="name"
          autoComplete="off"
          required
          minLength={1}
          maxLength={64}
          errors={actionData?.errors.fieldErrors.name}
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
                  newMap.set(u.id, Decimal.create(0, fractionDigits));
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
        {!Decimal.equals(total, amount) && (
          <FieldError
            errors={[
              `Total amount must match the expense amount. Difference: ${Decimal.toString(Decimal.sub(total, amount))}`,
            ]}
          />
        )}

        <input type="hidden" name="splitCurrency" value={split.currency} />

        <Button type="submit" className="mt-2">
          Create
        </Button>
        {actionData?.errors.formErrors && (
          <FieldError errors={actionData.errors.formErrors} />
        )}
      </Form>
    </div>
  );
}
