import { currencies, type CurrencySymbol } from "./currency.js";
import { create as rateFromText, type ExchangeRate } from "./exchange-rate.js";
import * as R from "./rational.js";

declare const money: unique symbol;
/** Signed, quantized minor units in a validated currency. Plain data supports
 * React Router transport. No implicit number conversion or scale conversion.
 * Arithmetic is exact and unbounded; callers enforce business limits such as
 * the maximum amount at their input boundaries. Invalid decimal syntax or
 * currency, excess precision, mismatched currencies, and division by zero
 * throw RangeError.
 */
export interface Money {
  readonly minorUnits: bigint;
  readonly currency: CurrencySymbol;
  readonly [money]: true;
}
const fractions = (currency: CurrencySymbol) => {
  if (!Object.hasOwn(currencies, currency))
    throw new RangeError("Invalid currency.");
  return currencies[currency].fractions;
};
export const fromMinorUnits = (
  minorUnits: bigint,
  currency: CurrencySymbol,
): Money => {
  fractions(currency);
  return Object.freeze({ minorUnits, currency }) as Money;
};
/** Parse an already quantized major-unit decimal, rejecting excess precision. */
export const create = (text: string, currency: CurrencySymbol): Money => {
  const scaled = R.multiply(
    R.parse(text),
    R.rational(10n ** BigInt(fractions(currency))),
  );
  if (scaled.denominator !== 1n)
    throw new RangeError("Amount has excess precision.");
  return fromMinorUnits(scaled.numerator, currency);
};
/** Explicit quantization boundary; signed ties round away from zero. */
export const round = (text: string, currency: CurrencySymbol): Money =>
  fromRational(R.parse(text), currency);
const fromRational = (value: R.Rational, currency: CurrencySymbol): Money =>
  fromMinorUnits(
    R.round(R.multiply(value, R.rational(10n ** BigInt(fractions(currency))))),
    currency,
  );
export const toString = (amount: Money): string =>
  R.fixed(amount.minorUnits, fractions(amount.currency));
export const assertCurrency = (
  amount: Money,
  currency: CurrencySymbol,
): void => {
  if (amount.currency !== currency)
    throw new RangeError("Money currencies must match.");
};
export const compare = (a: Money, b: Money | 0): number => {
  if (b !== 0) assertCurrency(b, a.currency);
  const other = b === 0 ? 0n : b.minorUnits;
  return (
    a.minorUnits < other ? -1
    : a.minorUnits > other ? 1
    : 0
  );
};
export const equals = (a: Money, b: Money | 0): boolean => compare(a, b) === 0;
export const gt = (a: Money, b: Money | 0): boolean => compare(a, b) > 0;
export const add = (a: Money, b: Money): Money => {
  assertCurrency(b, a.currency);
  return fromMinorUnits(a.minorUnits + b.minorUnits, a.currency);
};
export const sub = (a: Money, b: Money): Money => {
  assertCurrency(b, a.currency);
  return fromMinorUnits(a.minorUnits - b.minorUnits, a.currency);
};
export const negate = (a: Money): Money =>
  fromMinorUnits(-a.minorUnits, a.currency);
/** Evaluate exact arithmetic, quantizing only the final result. */
export const calculate = (text: string, currency: CurrencySymbol): Money =>
  fromRational(R.expression(text), currency);
const conversionMultiplier = (
  from: CurrencySymbol,
  rate: ExchangeRate,
  to: CurrencySymbol,
): R.Rational =>
  R.multiply(
    R.parse(rateFromText(rate)),
    R.rational(10n ** BigInt(fractions(to)), 10n ** BigInt(fractions(from))),
  );
export const convertAndAllocate = (
  total: Money,
  parts: readonly Money[],
  rate: ExchangeRate,
  currency: CurrencySymbol,
): { total: Money; parts: Money[] } => {
  const sum = parts.reduce((sum, part) => {
    assertCurrency(part, total.currency);
    return sum + part.minorUnits;
  }, 0n);
  if (sum !== total.minorUnits)
    throw new RangeError("Allocated parts must sum to the total.");
  const multiplier = conversionMultiplier(total.currency, rate, currency);
  const converted = fromMinorUnits(
    R.round(R.multiply(R.rational(total.minorUnits), multiplier)),
    currency,
  );
  return {
    total: converted,
    parts: R.allocate(
      converted.minorUnits,
      parts.map((part) => R.multiply(R.rational(part.minorUnits), multiplier)),
    ).map((units) => fromMinorUnits(units, currency)),
  };
};
/** Decimal weights from 0 to one million; blanks count as zero. */
export const weight = (text: string): string => {
  const value = R.parse(text.trim().replace(",", ".") || "0");
  if (value.numerator < 0n || value.numerator > 1000000n * value.denominator)
    throw new RangeError("Weight must be between 0 and 1000000.");
  return R.decimalText(value);
};
export const stepWeight = (text: string, delta: number): string => {
  if (!Number.isSafeInteger(delta))
    throw new RangeError("Invalid weight step.");
  const value = R.add(R.parse(weight(text)), R.rational(BigInt(delta)));
  return value.numerator < 0n ? "0" : weight(R.decimalText(value));
};
/** Caller supplies tie priority through weight order. Zero weights get no units.
 * Parts always sum to the total, so a nonzero total needs a positive weight.
 */
export const allocate = (total: Money, weights: readonly string[]): Money[] => {
  const values = weights.map((value) => R.parse(weight(value)));
  const sum = values.reduce(R.add, R.rational(0n));
  if (sum.numerator === 0n) {
    if (total.minorUnits !== 0n)
      throw new RangeError("A nonzero total needs a positive weight.");
    return values.map(() => fromMinorUnits(0n, total.currency));
  }
  return R.allocate(
    total.minorUnits,
    values.map((value) =>
      R.divide(R.multiply(R.rational(total.minorUnits), value), sum),
    ),
  ).map((units) => fromMinorUnits(units, total.currency));
};
/** Intl accepts exact decimal strings at runtime; older TS lib declarations omit them. */
export const formatDecimal = (
  text: string,
  formatter: Intl.NumberFormat,
): string => (formatter.format as (value: string) => string)(text);
