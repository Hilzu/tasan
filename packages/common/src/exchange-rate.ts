import * as R from "./rational.js";

declare const exchangeRate: unique symbol;
/** Canonical decimal text of a rate from 0.000001 to 1000000 that a JS number
 * holds exactly, as provider rates arrive and as DynamoDB stores them.
 * Invalid inputs throw RangeError.
 */
export type ExchangeRate = string & { readonly [exchangeRate]: true };
export const create = (text: string): ExchangeRate => {
  const value = R.parse(text);
  const canonical = R.decimalText(value);
  if (
    value.numerator * 1000000n < value.denominator ||
    value.numerator > 1000000n * value.denominator
  )
    throw new RangeError("Exchange rate must be between 0.000001 and 1000000.");
  if (String(Number(canonical)) !== canonical)
    throw new RangeError("Exchange rate has too many digits.");
  return canonical as ExchangeRate;
};
const atLeastPowerOfTen = (
  { numerator, denominator }: R.Rational,
  exponent: number,
) =>
  exponent >= 0 ?
    numerator >= 10n ** BigInt(exponent) * denominator
  : numerator * 10n ** BigInt(-exponent) >= denominator;
/** `dividend / divisor` as a rate, such as a cross rate through a shared
 * currency. Rounds half away from zero to 15 significant digits, the most any
 * decimal keeps through a JS number. Out-of-range results throw RangeError.
 */
export const quotient = (
  dividend: ExchangeRate,
  divisor: ExchangeRate,
): ExchangeRate => {
  const value = R.divide(R.parse(dividend), R.parse(divisor));
  let exponent = 0;
  while (atLeastPowerOfTen(value, exponent + 1)) exponent++;
  while (!atLeastPowerOfTen(value, exponent)) exponent--;
  const fractions = Math.max(0, 14 - exponent);
  const units = R.round(
    R.multiply(value, R.rational(10n ** BigInt(fractions))),
  );
  return create(R.fixed(units, fractions));
};
/** Explicit display boundary, rounded half away from zero. */
export const reciprocal = (rate: ExchangeRate, fractions: number): string => {
  if (!Number.isInteger(fractions) || fractions < 0 || fractions > 38)
    throw new RangeError("Invalid precision.");
  return R.fixed(
    R.round(
      R.divide(R.rational(10n ** BigInt(fractions)), R.parse(create(rate))),
    ),
    fractions,
  );
};
