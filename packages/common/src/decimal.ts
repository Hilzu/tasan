const toNumber = (value: number | Decimal): number =>
  typeof value === "number" ? value : value.value;

export type Decimal = Readonly<{ value: number; fractions: number }>;

// Interpret the decimal representation, including exponent notation, before
// arithmetic introduces binary floating-point rounding into currency values.
const toRational = (value: Decimal | number) => {
  const number = toNumber(value);
  if (!Number.isFinite(number))
    throw new RangeError("A decimal value must be finite.");
  const [coefficient, exponent = "0"] = number.toString().split("e");
  const [whole, fraction = ""] = coefficient.split(".");
  const numerator = BigInt(whole + fraction);
  const power = Number(exponent) - fraction.length;
  return power >= 0 ?
      { numerator: numerator * 10n ** BigInt(power), denominator: 1n }
    : { numerator, denominator: 10n ** BigInt(-power) };
};

type Rational = ReturnType<typeof toRational>;

const multiply = (a: Rational, b: Rational, fractions: number): Rational => ({
  numerator: a.numerator * b.numerator * 10n ** BigInt(fractions),
  denominator: a.denominator * b.denominator,
});

// Half-up ties round away from zero, including for negative amounts.
const roundUnits = ({ numerator, denominator }: Rational) => {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const units = (magnitude * 2n + denominator) / (denominator * 2n);
  return numerator < 0n ? -units : units;
};

const fromUnits = (units: bigint, fractions: number): Decimal =>
  create(Number(units) / 10 ** fractions, fractions);

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

// Keep source precision until multiplication is complete, then round half up.
export const mul = (
  a: Decimal,
  b: Decimal | number,
  fractions = a.fractions,
): Decimal =>
  fromUnits(
    roundUnits(multiply(toRational(a), toRational(b), fractions)),
    fractions,
  );

/**
 * Multiply a total and its parts without independently rounding each part.
 * Parts must sum to the total. Allocate minor units by largest remainder;
 * equal remainders favour earlier parts, so callers control their tie policy.
 */
export const mulAndAllocate = (
  total: Decimal,
  parts: readonly Decimal[],
  multiplier: Decimal | number,
  fractions = total.fractions,
): { total: Decimal; parts: Decimal[] } => {
  const sourceTotal = toRational(total);
  const sources = parts.map(toRational);
  // Decimal denominators are powers of ten, so the largest is a common scale.
  const denominator = sources.reduce(
    (scale, source) =>
      source.denominator > scale ? source.denominator : scale,
    sourceTotal.denominator,
  );
  const sum = sources.reduce(
    (sum, source) =>
      sum + source.numerator * (denominator / source.denominator),
    0n,
  );
  if (sum !== sourceTotal.numerator * (denominator / sourceTotal.denominator))
    throw new RangeError("Allocated parts must sum to the total.");
  const rate = toRational(multiplier);
  const totalUnits = roundUnits(multiply(sourceTotal, rate, fractions));
  const allocations = sources.map((part, index) => {
    const { numerator, denominator } = multiply(part, rate, fractions);
    // BigInt division truncates; allocation needs the floor for signed parts.
    const remainder = ((numerator % denominator) + denominator) % denominator;
    return {
      index,
      units: (numerator - remainder) / denominator,
      remainder,
      denominator,
    };
  });
  const remaining =
    totalUnits - allocations.reduce((sum, part) => sum + part.units, 0n);
  const order = [...allocations].sort((a, b) => {
    const difference =
      b.remainder * a.denominator - a.remainder * b.denominator;
    return (
      difference > 0n ? 1
      : difference < 0n ? -1
      : a.index - b.index
    );
  });
  for (const part of order.slice(0, Number(remaining))) part.units++;
  return {
    total: fromUnits(totalUnits, fractions),
    parts: allocations.map(({ units }) => fromUnits(units, fractions)),
  };
};

export const div = (a: Decimal, b: Decimal | number): Decimal => {
  return create(a.value / toNumber(b), a.fractions);
};
