import * as R from "./rational.js";

declare const exchangeRate: unique symbol;
/** A positive decimal string: <=38 significant digits, exponent -130..125.
 * Magnitude is 1e-130 through (10^38-1)*10^88; invalid inputs throw RangeError.
 * create preserves the published decimal value exactly; round quantizes
 * provider rates that carry more digits than storage allows.
 */
export type ExchangeRate = string & { readonly [exchangeRate]: true };
export const create = (text: string): ExchangeRate => {
  const canonical = R.storageDecimal(text);
  if (R.parse(canonical).numerator <= 0n)
    throw new RangeError("Exchange rate must be positive.");
  return canonical as ExchangeRate;
};
/** Explicit quantization boundary for provider data: rounds to 38 significant
 * digits, half away from zero. Values outside the magnitude range still throw.
 */
export const round = (text: string): ExchangeRate => {
  const value = R.parse(text);
  if (value.numerator <= 0n)
    throw new RangeError("Exchange rate must be positive.");
  const pow10 = (power: number) =>
    power >= 0 ?
      R.rational(10n ** BigInt(power))
    : R.rational(1n, 10n ** BigInt(-power));
  // Scale to [1e37, 1e39) from the digit counts, then correct to [1e37, 1e38).
  let power =
    38 -
    (value.numerator.toString().length - value.denominator.toString().length);
  let scaled = R.multiply(value, pow10(power));
  if (scaled.numerator >= 10n ** 38n * scaled.denominator)
    scaled = R.multiply(value, pow10(--power));
  return create(
    R.decimalText(R.divide(R.rational(R.round(scaled)), pow10(power))),
  );
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
