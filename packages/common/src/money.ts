import { currencies, type CurrencySymbol } from "./currency.js";
import * as E from "./exact.js";
import { create as rateFromText, type ExchangeRate } from "./exchange-rate.js";

declare const money: unique symbol;
/** Signed, quantized minor units in a validated currency. Plain data supports
 * React Router transport. No implicit number conversion or scale conversion.
 * Constructors, conversion, and allocation enforce <=38 significant decimal
 * digits and magnitude <1e126 major units (the existing persistence range).
 * Addition, subtraction, and negation allow wider computed totals and balances,
 * up to 4096 minor-unit digits; persistence still validates individual amounts.
 * Invalid decimal syntax/currency, excess precision, mismatched
 * currencies, and division by zero also throw RangeError. Amount constructors
 * do not accept number inputs.
 * Text inputs are limited to 1024 characters; exact intermediates to 4096 digits.
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
const fromComputedUnits = (
  minorUnits: bigint,
  currency: CurrencySymbol,
): Money => {
  fractions(currency);
  if (
    typeof minorUnits !== "bigint" ||
    minorUnits.toString().replace(/^-/, "").length > 4096
  )
    throw new RangeError("Invalid minor units.");
  return Object.freeze({ minorUnits, currency }) as Money;
};
export const fromMinorUnits = (
  minorUnits: bigint,
  currency: CurrencySymbol,
): Money => {
  const scale = fractions(currency);
  if (typeof minorUnits !== "bigint" || minorUnits.toString().length > 129)
    throw new RangeError("Invalid minor units.");
  E.storageDecimal(E.fixed(minorUnits, scale));
  return fromComputedUnits(minorUnits, currency);
};
/** Parse an already quantized major-unit decimal, rejecting excess precision. */
export const create = (text: string, currency: CurrencySymbol): Money => {
  const scaled = E.multiply(
    E.parse(text),
    E.rational(10n ** BigInt(fractions(currency))),
  );
  if (scaled.denominator !== 1n)
    throw new RangeError("Amount has excess precision.");
  return fromMinorUnits(scaled.numerator, currency);
};
/** Explicit quantization boundary; signed ties round away from zero. */
export const round = (text: string, currency: CurrencySymbol): Money =>
  fromRational(E.parse(text), currency);
const fromRational = (value: E.Rational, currency: CurrencySymbol): Money =>
  fromMinorUnits(
    E.round(E.multiply(value, E.rational(10n ** BigInt(fractions(currency))))),
    currency,
  );
/** Quantize legacy decimal parts against their rounded total. Equal remainders
 * favour earlier parts. Each part must stay within one minor unit of its stored
 * value, allowing historical rounding differences and floating-point noise.
 */
export const roundAndAllocate = (
  total: Money,
  parts: readonly string[],
): Money[] => {
  const scale = E.rational(10n ** BigInt(fractions(total.currency)));
  const values = parts.map((text) => E.multiply(E.parse(text), scale));
  return E.allocate(total.minorUnits, values).map((units, index) => {
    const { numerator, denominator } = values[index];
    const difference = units * denominator - numerator;
    if (difference <= -denominator || difference >= denominator)
      throw new RangeError("Allocated parts must sum to the total.");
    return fromMinorUnits(units, total.currency);
  });
};
export const toString = (amount: Money): string =>
  E.fixed(amount.minorUnits, fractions(amount.currency));
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
  return fromComputedUnits(a.minorUnits + b.minorUnits, a.currency);
};
export const sub = (a: Money, b: Money): Money => {
  assertCurrency(b, a.currency);
  return fromComputedUnits(a.minorUnits - b.minorUnits, a.currency);
};
export const negate = (a: Money): Money =>
  fromComputedUnits(-a.minorUnits, a.currency);
/** Evaluate exact arithmetic, quantizing only the final result. */
export const calculate = (text: string, currency: CurrencySymbol): Money =>
  fromRational(E.expression(text), currency);
export const convert = (
  amount: Money,
  rate: ExchangeRate,
  currency: CurrencySymbol,
): Money =>
  fromRational(
    E.multiply(E.parse(toString(amount)), E.parse(rateFromText(rate))),
    currency,
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
  const converted = convert(total, rate, currency);
  const multiplier = E.multiply(
    E.parse(rateFromText(rate)),
    E.rational(
      10n ** BigInt(fractions(currency)),
      10n ** BigInt(fractions(total.currency)),
    ),
  );
  return {
    total: converted,
    parts: E.allocate(
      converted.minorUnits,
      parts.map((part) => E.multiply(E.rational(part.minorUnits), multiplier)),
    ).map((units) => fromMinorUnits(units, currency)),
  };
};
/** Nonnegative decimal weights; blanks count as zero. */
export const weight = (text: string): string => {
  const value = E.parse(text.trim().replace(",", ".") || "0");
  if (value.numerator < 0n) throw new RangeError("Weight must be nonnegative.");
  return E.storageDecimal(E.decimalText(value));
};
export const stepWeight = (text: string, delta: number): string => {
  if (!Number.isSafeInteger(delta))
    throw new RangeError("Invalid weight step.");
  const value = E.add(E.parse(weight(text)), E.rational(BigInt(delta)));
  return value.numerator < 0n ? "0" : weight(E.decimalText(value));
};
/** Caller supplies tie priority through weight order. Zero weights get no units. */
export const allocate = (total: Money, weights: readonly string[]): Money[] => {
  const values = weights.map((value) => E.parse(weight(value)));
  const sum = values.reduce(E.add, E.rational(0n));
  if (sum.numerator === 0n)
    return values.map(() => fromMinorUnits(0n, total.currency));
  return E.allocate(
    total.minorUnits,
    values.map((value) =>
      E.divide(E.multiply(E.rational(total.minorUnits), value), sum),
    ),
  ).map((units) => fromMinorUnits(units, total.currency));
};
/** Intl accepts exact decimal strings at runtime; older TS lib declarations omit them. */
export const formatDecimal = (
  text: string,
  formatter: Intl.NumberFormat,
): string => (formatter.format as (value: string) => string)(text);
