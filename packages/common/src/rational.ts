// Internal rational arithmetic. Public Money/rate APIs validate their own domains.
// Inputs are short plain decimals, so values stay small without size checks.
export interface Rational {
  numerator: bigint;
  denominator: bigint;
}
const gcd = (a: bigint, b: bigint): bigint => {
  while (b !== 0n) {
    const remainder = a % b;
    a = b;
    b = remainder;
  }
  return a;
};
export const rational = (numerator: bigint, denominator = 1n): Rational => {
  if (denominator === 0n) throw new RangeError("Division by zero.");
  if (denominator < 0n) {
    numerator = -numerator;
    denominator = -denominator;
  }
  const factor = gcd(numerator < 0n ? -numerator : numerator, denominator);
  return { numerator: numerator / factor, denominator: denominator / factor };
};
/** Plain decimal text such as "-12.50" or ".5"; no exponent notation. */
export const parse = (text: string): Rational => {
  const match =
    text.length <= 100 &&
    /^([+-]?)(?=\.?\d)(\d*)(?:\.(\d*))?$/.exec(text.trim());
  if (!match) throw new RangeError("Invalid decimal.");
  const [, sign, whole, fraction = ""] = match;
  return rational(
    BigInt(`${sign}${whole}${fraction}`),
    10n ** BigInt(fraction.length),
  );
};
export const add = (a: Rational, b: Rational) =>
  rational(
    a.numerator * b.denominator + b.numerator * a.denominator,
    a.denominator * b.denominator,
  );
export const negate = (a: Rational) => rational(-a.numerator, a.denominator);
export const subtract = (a: Rational, b: Rational) => add(a, negate(b));
export const multiply = (a: Rational, b: Rational) =>
  rational(a.numerator * b.numerator, a.denominator * b.denominator);
export const divide = (a: Rational, b: Rational) =>
  rational(a.numerator * b.denominator, a.denominator * b.numerator);
// Half-unit ties always round away from zero.
export const round = ({ numerator, denominator }: Rational): bigint => {
  const magnitude = numerator < 0n ? -numerator : numerator;
  const units = (2n * magnitude + denominator) / (2n * denominator);
  return numerator < 0n ? -units : units;
};
export const fixed = (units: bigint, fractions: number): string => {
  const magnitude = (units < 0n ? -units : units)
    .toString()
    .padStart(fractions + 1, "0");
  return `${units < 0n ? "-" : ""}${fractions ? `${magnitude.slice(0, -fractions)}.${magnitude.slice(-fractions)}` : magnitude}`;
};
export const decimalText = (value: Rational): string => {
  let denominator = value.denominator;
  let twos = 0;
  let fives = 0;
  while (denominator % 2n === 0n) {
    denominator /= 2n;
    twos++;
  }
  while (denominator % 5n === 0n) {
    denominator /= 5n;
    fives++;
  }
  if (denominator !== 1n) throw new RangeError("Non-terminating decimal.");
  const scale = Math.max(twos, fives);
  const text = fixed(
    value.numerator * (10n ** BigInt(scale) / value.denominator),
    scale,
  );
  return scale ? text.replace(/0+$/, "").replace(/\.$/, "") : text;
};
/** Largest remainder with signed floors; ties favour earlier input parts. */
export const allocate = (
  total: bigint,
  parts: readonly Rational[],
): bigint[] => {
  const entries = parts.map(({ numerator, denominator }, index) => {
    const remainder = ((numerator % denominator) + denominator) % denominator;
    return {
      index,
      units: (numerator - remainder) / denominator,
      remainder,
      denominator,
    };
  });
  const remaining =
    total - entries.reduce((sum, entry) => sum + entry.units, 0n);
  if (remaining < 0n || remaining > BigInt(entries.length))
    throw new RangeError("Invalid allocation total.");
  const order = [...entries].sort((a, b) => {
    const difference =
      b.remainder * a.denominator - a.remainder * b.denominator;
    return (
      difference < 0n ? -1
      : difference > 0n ? 1
      : a.index - b.index
    );
  });
  for (const entry of order.slice(0, Number(remaining))) entry.units++;
  return entries.map(({ units }) => units);
};

export const expression = (text: string): Rational => {
  if (text.length > 200) throw new RangeError("Calculation is too long.");
  const tokens = text.match(/\d+[.,]?\d*|[.,]\d+|[-+*/()]|\S/g) ?? [];
  let pos = 0;
  const expr = (): Rational => {
    let result = term();
    while (tokens[pos] === "+" || tokens[pos] === "-")
      result =
        tokens[pos++] === "+" ? add(result, term()) : subtract(result, term());
    return result;
  };
  const term = (): Rational => {
    let result = factor();
    while (tokens[pos] === "*" || tokens[pos] === "/")
      result =
        tokens[pos++] === "*" ?
          multiply(result, factor())
        : divide(result, factor());
    return result;
  };
  const factor = (): Rational => {
    const token = tokens.at(pos++);
    if (token === "+") return factor();
    if (token === "-") return negate(factor());
    if (token === "(") {
      const result = expr();
      if (tokens[pos++] !== ")") throw new RangeError("Invalid calculation.");
      return result;
    }
    if (token === undefined || !/^[\d.,]+$/.test(token))
      throw new RangeError("Invalid calculation.");
    return parse(token.replace(",", "."));
  };
  const result = expr();
  if (pos !== tokens.length) throw new RangeError("Invalid calculation.");
  return result;
};
