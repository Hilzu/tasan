import assert from "node:assert/strict";
import { test } from "node:test";

import * as M from "@tasan/common/money";

import { type Example, examples, people } from "./example-splits";

const zero = M.create("0", "EUR");

const byName = (name: string) => {
  const example = examples.find((entry) => entry.name === name);
  assert.ok(example);
  return example;
};

const show = (values: Iterable<readonly [string, M.Money]>) =>
  Object.fromEntries(
    [...values].map(([key, value]) => [key, M.toString(value)]),
  );

// Paid minus owed per person: positive when others owe them.
const balances = ({ expenses }: Example) =>
  new Map(
    people.map((person) => [
      person,
      expenses.reduce(
        (balance, expense) =>
          M.sub(
            expense.paidBy === person ?
              M.add(balance, M.create(expense.amount, "EUR"))
            : balance,
            expense.owed.get(person) ?? zero,
          ),
        zero,
      ),
    ]),
  );

await test("every example splits each expense exactly and settles up", () => {
  for (const example of examples) {
    for (const expense of example.expenses)
      assert.equal(
        M.toString([...expense.owed.values()].reduce(M.add)),
        M.toString(M.create(expense.amount, "EUR")),
        `${example.name}: ${expense.name}`,
      );
    const settled = balances(example);
    for (const { from, to, amount } of example.payments) {
      settled.set(from, M.add(settled.get(from) ?? zero, amount));
      settled.set(to, M.sub(settled.get(to) ?? zero, amount));
    }
    for (const balance of settled.values())
      assert.ok(M.equals(balance, 0), example.name);
  }
});

await test("dinner out applies the plus-one share and the champagne adjustment", () => {
  const example = byName("Dinner out");
  assert.deepEqual(
    example.expenses.map(({ owed }) => show(owed)),
    [
      { Alex: "30.00", Sam: "60.00", Jo: "30.00" },
      { Alex: "20.00", Sam: "8.00", Jo: "8.00" },
    ],
  );
  assert.deepEqual(show(balances(example)), {
    Alex: "70.00",
    Sam: "-32.00",
    Jo: "-38.00",
  });
  assert.deepEqual(
    example.payments.map(({ from, to, amount }) => [
      from,
      to,
      M.toString(amount),
    ]),
    [
      ["Jo", "Alex", "38.00"],
      ["Sam", "Alex", "32.00"],
    ],
  );
});

await test("shared home splits electricity by room size to the cent", () => {
  const { expenses, payments } = byName("Shared home");
  // 90 / 3.5 leaves a cent over, which goes to Sam as the payer.
  assert.deepEqual(show(expenses[1].owed), {
    Alex: "38.57",
    Sam: "25.72",
    Jo: "25.71",
  });
  assert.deepEqual(
    payments.map(({ from, to, amount }) => [from, to, M.toString(amount)]),
    [
      ["Jo", "Alex", "41.43"],
      ["Jo", "Sam", "24.28"],
    ],
  );
});
