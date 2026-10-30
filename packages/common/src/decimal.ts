const toNumber = (value: number | Decimal): number =>
  typeof value === "number" ? value : value.value;

export type Decimal = Readonly<{ value: number; fractions: number }>;

// Interpret the decimal representation, including exponent notation, before
// arithmetic introduces binary floating-point rounding into currency values.
export const toRational = (value: Decimal | number) => {
  const number = toNumber(value);
  if (!Number.isFinite(number))
    throw new RangeError("A rational value must be finite.");
  const [coefficient, exponent = "0"] = number.toString().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const numerator = BigInt(whole + fraction);
  const power = Number(exponent) - fraction.length;
  return power >= 0 ?
      { numerator: numerator * 10n ** BigInt(power), denominator: 1n }
    : { numerator, denominator: 10n ** BigInt(-power) };
};

export const create = (value: Decimal | number, fractions = 2): Decimal => {
  return {
    value: Number(toNumber(value).toFixed(fractions)),
    fractions,
  };
};

export const toString = (decimal: Decimal): string =>
  decimal.value.toFixed(decimal.fractions);

export const equals = (a: Decimal, b: Decimal | number): boolean =>
  a.value === toNumber(b);

export const gt = (a: Decimal, b: Decimal | number): boolean =>
  a.value > toNumber(b);

export const add = (a: Decimal, b: Decimal | number): Decimal => {
  return create(a.value + toNumber(b), a.fractions);
};

export const sub = (a: Decimal, b: Decimal | number): Decimal => {
  return create(a.value - toNumber(b), a.fractions);
};

export const mul = (a: Decimal, b: Decimal | number): Decimal => {
  return create(a.value * toNumber(b), a.fractions);
};

export const div = (a: Decimal, b: Decimal | number): Decimal => {
  return create(a.value / toNumber(b), a.fractions);
};
