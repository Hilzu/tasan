import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as D from "@tasan/common/decimal";
import { genExpenseID, genOperationID, type UserID } from "@tasan/common/id";
import { currencySymbolSchema } from "@tasan/common/validation";
import type { SplitExpense } from "@tasan/data";
import classNames from "classnames";
import {
  type ComponentProps,
  useEffect,
  useLayoutEffect,
  useState,
} from "react";
import { useFetcher, useRouteLoaderData } from "react-router";

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
import {
  calculateExpenseAmounts,
  calculateShareAmounts,
  parseShares,
  stepShares,
} from "~/routes/split/expense-amounts";
import type { SplitLoader } from "~/routes/split/split-parent";

type AllocationMode = "amounts" | "shares";

const allocationModes: { value: AllocationMode; label: string }[] = [
  { value: "amounts", label: "Amounts" },
  { value: "shares", label: "Shares and adjustments" },
];

interface ShareFormInput {
  shares: string;
  adjustment: AmountInput;
}

const emptyShareInput: ShareFormInput = {
  shares: "0",
  adjustment: emptyAmountInput,
};

export function ExpenseForm({ expense }: { expense?: SplitExpense }) {
  const parentData = useRouteLoaderData<SplitLoader>("split-parent");
  if (!parentData) throw new Error("Parent data not found");
  const { split, users, session } = parentData;
  const fetcher = useFetcher<{
    errors: { formErrors: string[]; fieldErrors: Record<string, string[]> };
  }>();
  const actionData = fetcher.data;
  const [submissionID, setSubmissionID] = useState("");
  useEffect(() => {
    setSubmissionID(expense ? genOperationID() : genExpenseID());
  }, [split.id, session.userID, expense?.id]);
  const [preferredCurrency, setPreferredCurrency] =
    useStorage<CurrencySymbol>("preferredCurrency");
  const [currency, setCurrency] = useState(expense?.currency ?? split.currency);
  const fractionDigits = currencies[currency].fractions;
  const [total, setTotal] = useState<AmountInput>(() =>
    expense ?
      { text: D.toString(expense.amount), expressionMode: false }
    : emptyAmountInput,
  );
  const [payer, setPayer] = useState(expense?.payer ?? session.userID);
  const [participants, setParticipants] = useState(
    () =>
      new Map<UserID, AmountInput>(
        expense ?
          [...expense.participants].map(([id, amount]) => [
            id,
            { text: D.toString(amount), expressionMode: false },
          ])
        : users.map(({ id }) => [id, emptyAmountInput]),
      ),
  );
  const [mode, setMode] = useState<AllocationMode>("amounts");
  // Missing entries use the defaults: zero shares and no adjustment.
  const [shareInputs, setShareInputs] = useState(
    () => new Map<UserID, ShareFormInput>(),
  );
  const shareInputFor = (id: UserID) => shareInputs.get(id) ?? emptyShareInput;
  const updateShareInput = (id: UserID, input: Partial<ShareFormInput>) => {
    setShareInputs((prev) =>
      new Map(prev).set(id, { ...(prev.get(id) ?? emptyShareInput), ...input }),
    );
  };
  useLayoutEffect(() => {
    if (!expense && preferredCurrency) setCurrency(preferredCurrency);
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
  const shared = calculateShareAmounts(
    amount,
    new Map(
      [...participants.keys()].map((id) => {
        const input = shareInputFor(id);
        return [
          id,
          {
            shares: parseShares(input.shares),
            adjustment: resolveAmount(
              input.adjustment.text,
              input.adjustment.expressionMode,
              fractionDigits,
            ),
          },
        ];
      }),
    ),
    fractionDigits,
    payer,
  );
  const byShares = mode === "shares";
  const valid = byShares ? shared.valid : calculated.valid;
  const difference = byShares ? shared.difference : calculated.difference;
  const amountError =
    byShares ?
      amount === undefined ? "Enter a total to split by shares."
      : !D.gt(amount, 0) ? "Enter a positive total."
      : undefined
    : calculated.hasAmounts && !D.gt(calculated.amount, 0) ?
      "Enter a positive total or participant amounts."
    : undefined;
  const allocationError =
    byShares && amount === undefined ? undefined
    : D.gt(difference, 0) ?
      `${currency} ${D.toString(difference)} left to allocate.${byShares ? " Set shares or adjustments." : ""}`
    : D.gt(D.create(0, fractionDigits), difference) ?
      `${byShares ? "Adjustments" : "Participant amounts"} exceed total by ${currency} ${D.toString(D.mul(difference, -1))}.`
    : undefined;

  return (
    <div>
      <MainHeading>
        {expense ? "Edit expense" : `New expense for ${split.name}`}
      </MainHeading>
      <fetcher.Form
        method="post"
        className="max-w-md space-y-2"
        onSubmit={(event) => {
          if (!valid) event.preventDefault();
        }}
      >
        {expense ?
          <input type="hidden" name="operationID" value={submissionID} />
        : <input type="hidden" name="expenseID" value={submissionID} />}
        <InputField
          label="Name"
          name="expenseName"
          defaultValue={expense?.name}
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
            setShareInputs(
              (inputs) =>
                new Map(
                  [...inputs].map(([id, input]) => [
                    id,
                    {
                      ...input,
                      adjustment: normalizeAmountInput(
                        input.adjustment,
                        fractions,
                        true,
                      ),
                    },
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
            !byShares && calculated.hasAmounts ? calculated.amount : undefined
          }
          placeholder={
            !byShares && calculated.hasAmounts && amount === undefined ?
              D.toString(calculated.amount)
            : undefined
          }
          name="amount"
          value={total}
          onValueChange={setTotal}
          currencySymbol={currency}
          description={
            byShares ?
              "Required when splitting by shares. Adjustments are applied first, and the rest is split by shares."
            : amount === undefined && calculated.hasAmounts ?
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
              setShareInputs((prev) => {
                const newMap = new Map(prev);
                newMap.delete(u.id);
                return newMap;
              });
            },
          }))}
        />

        <RadioGroupField
          label="Split by"
          inline
          items={allocationModes.map(({ value, label }) => ({
            value,
            label,
            name: "allocationMode",
            checked: mode === value,
            onChange: () => {
              setMode(value);
            },
          }))}
        />

        {byShares && participants.size > 0 && (
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm">
              Adjust up for extras or down for anything cheaper.
            </p>
            <Button
              variant="secondary"
              className="shrink-0"
              onClick={() => {
                setShareInputs(
                  (prev) =>
                    new Map(
                      [...participants.keys()].map((id) => [
                        id,
                        { ...(prev.get(id) ?? emptyShareInput), shares: "1" },
                      ]),
                    ),
                );
              }}
            >
              Even shares
            </Button>
          </div>
        )}

        {byShares &&
          [...participants.keys()].map((userID) => {
            const input = shareInputFor(userID);
            const participantAmount =
              shared.participants.get(userID) ?? D.create(0, fractionDigits);
            return (
              <fieldset
                key={userID}
                className="min-w-0 rounded-sm border border-gray-300 p-2"
              >
                <legend className="px-1">
                  {users.find((u) => u.id === userID)?.name ?? "Unknown"}:{" "}
                  {currency} {D.toString(participantAmount)}
                </legend>
                <input
                  type="hidden"
                  name={`participants.${userID}`}
                  value={D.toString(participantAmount)}
                />
                <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,2fr)] gap-2">
                  <InputField
                    label="Shares"
                    type="text"
                    inputMode="decimal"
                    autoComplete="off"
                    value={input.shares}
                    leadingAddon={
                      <StepButton
                        label="Fewer shares"
                        leading
                        disabled={(parseShares(input.shares) ?? 0) <= 0}
                        onClick={() => {
                          updateShareInput(userID, {
                            shares: stepShares(input.shares, -1),
                          });
                        }}
                      >
                        −
                      </StepButton>
                    }
                    trailingAddon={
                      <StepButton
                        label="More shares"
                        onClick={() => {
                          updateShareInput(userID, {
                            shares: stepShares(input.shares, 1),
                          });
                        }}
                      >
                        +
                      </StepButton>
                    }
                    onChange={(event) => {
                      updateShareInput(userID, { shares: event.target.value });
                    }}
                    errors={
                      shared.invalidShares.has(userID) ?
                        ["Enter zero or more shares."]
                      : undefined
                    }
                  />
                  <CurrencyInputField
                    label="Adjustment"
                    currencySymbol={currency}
                    allowNegative
                    placeholder={D.toString(D.create(0, fractionDigits))}
                    value={input.adjustment}
                    onValueChange={(adjustment) => {
                      updateShareInput(userID, { adjustment });
                    }}
                  />
                </div>
                {/* Until the total is allocated, the remainder error says enough. */}
                {amount !== undefined &&
                  D.equals(shared.difference, 0) &&
                  !shared.invalidShares.has(userID) &&
                  shared.invalidAmounts.has(userID) && (
                    <FieldError
                      errors={[
                        "Give a share or adjustment so this amount is positive, or remove this participant.",
                      ]}
                    />
                  )}
              </fieldset>
            );
          })}

        {!byShares &&
          [...participants.entries()].map(([userID, input]) => (
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
          className="mt-4"
          disabled={fetcher.state !== "idle" || !submissionID || !valid}
        >
          {fetcher.state === "submitting" ?
            "Saving..."
          : expense ?
            "Save changes"
          : "Create"}
        </Button>
        {actionData?.errors.formErrors && (
          <FieldError errors={actionData.errors.formErrors} />
        )}
      </fetcher.Form>
    </div>
  );
}

function StepButton({
  label,
  leading = false,
  ...rest
}: Omit<ComponentProps<"button">, "type" | "className"> & {
  label: string;
  // Leading addons are padded for text like currency symbols; cancel that so
  // both step buttons sit the same distance from the field edges.
  leading?: boolean;
}) {
  return (
    <button
      {...rest}
      type="button"
      title={label}
      aria-label={label}
      className={classNames(
        "rounded-sm px-2 text-lg leading-none text-gray-500 hover:text-gray-800 disabled:opacity-40",
        leading && "-ml-2",
      )}
    />
  );
}
