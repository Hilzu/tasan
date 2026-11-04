import * as R from "./rational.js";

declare const exchangeRate: unique symbol;
/** A positive decimal string: <=38 significant digits, exponent -130..125.
 * Magnitude is 1e-130 through (10^38-1)*10^88; invalid inputs throw RangeError.
 * Preserves the published decimal value, not the provider's internal precision.
 */
export type ExchangeRate = string & { readonly [exchangeRate]: true };
export const create = (text: string): ExchangeRate => {
  const canonical = R.storageDecimal(text);
  if (R.parse(canonical).numerator <= 0n)
    throw new RangeError("Exchange rate must be positive.");
  return canonical as ExchangeRate;
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
