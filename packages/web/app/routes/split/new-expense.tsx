import { currencies } from "@tasan/common/currency";
import { createSplitExpense, getSplitUser } from "@tasan/data";
import { useEffect, useState } from "react";
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
import type { SplitLoader } from "~/routes/split/split-parent";
import { currencySymbolSchema, validateOrRespond } from "~/validation";

import type { Route } from "./+types/new-expense";

const schema = zfd.formData(
  z
    .object({
      name: zfd.text(z.string().min(1).max(64)),
      currency: zfd.text(currencySymbolSchema),
      amount: zfd.numeric(z.number().positive()),
      payer: zfd.text(z.string()),
      participants: zfd.repeatableOfType(z.string()),
    })
    .catchall(z.record(zfd.numeric(z.number().positive()))),
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
  await createSplitExpense({
    splitID: splitUser.splitID,
    name: data.name,
    currency: data.currency,
    amount: data.amount,
    payer: data.payer,
    participants: new Set(data.participants),
    amounts: data.amounts,
    createdBy: splitUser.userID,
  });

  return redirect(href("/splits/:splitID", { splitID: splitUser.splitID }));
}

export default function NewExpense({ actionData }: Route.ComponentProps) {
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, session } = parentData;
  const [amount, setAmount] = useState(0);
  const [currency, setCurrency] = useState(split.currency);
  const [participants, setParticipants] = useState(
    () => new Set(users.map((u) => u.id)),
  );
  const [amounts, setAmounts] = useState(
    () => new Map([...participants].map((id) => [id, 0])),
  );
  useEffect(() => {
    setAmounts(
      new Map(
        [...participants].map((id) => [id, amount / (participants.size || 1)]),
      ),
    );
  }, [participants, amount]);

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
          onNumberChange={(number) => {
            setAmount(number);
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
            name: "participants",
            checked: participants.has(u.id),
            onChange: (event) => {
              setParticipants((prev) => {
                const newSet = new Set(prev);
                if (event.target.checked) newSet.add(u.id);
                else newSet.delete(u.id);
                return newSet;
              });
            },
          }))}
          errors={actionData?.errors.fieldErrors.participants}
        />

        {[...amounts.entries()].map(([userID, amount]) => (
          <CurrencyInputField
            required
            key={userID}
            currencySymbol={currency}
            label={`${users.find((u) => u.id === userID)?.name ?? "Unknown"} amount`}
            name={`amounts.${userID}`}
            value={amount}
            onNumberChange={(number) => {
              setAmounts((prev) => new Map(prev).set(userID, number));
            }}
            errors={actionData?.errors.fieldErrors[`amounts.${userID}`]}
          />
        ))}

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
