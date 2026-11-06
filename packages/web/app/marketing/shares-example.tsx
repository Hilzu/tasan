import * as M from "@tasan/common/money";
import classNames from "classnames";

import { MoneyRender } from "~/components/amount";

const calculation = "118 + 24.50";

// Alex paid, so Alex comes first and gets any tied rounding cent, as in the form.
const rows = [
  { name: "Alex", note: "Plus partner", shares: "2" },
  { name: "Sam", note: "Bottle of wine", shares: "1", adjustment: "18" },
  { name: "Jo", note: "Skipped dessert", shares: "1", adjustment: "-6" },
];

export function SharesExample() {
  const total = M.calculate(calculation, "EUR");
  const adjustments = rows.map(({ adjustment }) =>
    M.create(adjustment ?? "0", "EUR"),
  );
  const base = adjustments.reduce(M.sub, total);
  const allocated = M.allocate(
    base,
    rows.map(({ shares }) => shares),
  );
  const owed = allocated.map((share, index) =>
    M.add(share, adjustments[index]),
  );
  const sum = owed.reduce(M.add, M.create("0", "EUR"));

  return (
    <div className="space-y-4 text-sm">
      <div className="flex items-baseline justify-between gap-3">
        <h3 className="text-lg font-semibold">Birthday dinner</h3>
        <span className="text-xs text-gray-600 dark:text-gray-300">
          Paid by Alex
        </span>
      </div>
      <div>
        <p className="text-xs font-medium text-gray-600 dark:text-gray-300">
          Total
        </p>
        <p className="mt-1 flex min-h-10 items-center justify-between gap-2 rounded-lg border border-gray-300 bg-white px-3 tabular-nums dark:border-gray-600 dark:bg-gray-900">
          <span className="truncate">
            <span className="text-gray-500 dark:text-gray-400">EUR </span>
            {calculation}
          </span>
          <span className="flex shrink-0 items-center gap-2">
            <span className="text-gray-500 dark:text-gray-400">
              = <MoneyRender amount={total} />
            </span>
            <span
              aria-hidden="true"
              className="bg-brand-700 dark:bg-brand-300 dark:text-brand-950 rounded-sm px-1.5 text-white"
            >
              =
            </span>
          </span>
        </p>
      </div>
      <table className="w-full">
        <caption className="sr-only">
          Each person’s shares, adjustment and amount owed
        </caption>
        <thead className="text-xs text-gray-600 dark:text-gray-300">
          <tr>
            <th scope="col" className="pb-1 text-left font-medium">
              Person
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Shares
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              <span className="max-sm:hidden">Adjustment</span>
              <abbr title="Adjustment" className="no-underline sm:hidden">
                Adj.
              </abbr>
            </th>
            <th scope="col" className="pb-1 text-right font-medium">
              Owes
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row, index) => {
            const adjustment = adjustments[index];
            return (
              <tr
                key={row.name}
                className="border-t border-gray-200 dark:border-gray-700"
              >
                <th scope="row" className="py-2 pr-2 text-left font-normal">
                  {row.name}
                  <span className="block text-xs text-gray-600 dark:text-gray-300">
                    {row.note}
                  </span>
                </th>
                <td className="py-2 pl-2 text-right tabular-nums">
                  {row.shares}
                </td>
                <td
                  className={classNames(
                    "py-2 pl-2 text-right whitespace-nowrap tabular-nums",
                    M.equals(adjustment, 0) &&
                      "text-gray-400 dark:text-gray-500",
                  )}
                >
                  {M.equals(adjustment, 0) ?
                    "–"
                  : <MoneyRender amount={adjustment} signDisplay="always" />}
                </td>
                <td className="py-2 pl-2 text-right font-medium whitespace-nowrap tabular-nums">
                  <MoneyRender amount={owed[index]} />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="bg-brand-50 dark:bg-brand-900/40 text-brand-800 dark:text-brand-100 rounded-lg px-3 py-2 text-xs leading-relaxed">
        Adjustments come off first, then the remaining{" "}
        <MoneyRender amount={base} /> is split by shares. Adds up to{" "}
        <MoneyRender amount={sum} /> exactly.
      </p>
    </div>
  );
}
