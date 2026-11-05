// Internal rational arithmetic. Public Money/rate APIs validate their own domains.
/** A well-formed value outside the supported magnitude, precision, or size. */
export class OutOfRangeError extends RangeError {
  constructor(message: string) {
    super(message);
    this.name = "OutOfRangeError";
  }
}
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
  numerator /= factor;
  denominator /= factor;
  if (
    numerator.toString().length > 4096 ||
    denominator.toString().length > 4096
  )
    throw new OutOfRangeError("Calculation is too large.");
  return { numerator, denominator };
};
export const parse = (text: string): Rational => {
  if (typeof text !== "string") throw new RangeError("Invalid decimal.");
  if (text.length > 1024) throw new OutOfRangeError("Decimal is too long.");
  const match = /^([+-]?)(?:(\d+)(?:\.(\d*))?|\.(\d+))(?:e([+-]?\d+))?$/i.exec(
    text.trim(),
  );
  if (!match) throw new RangeError("Invalid decimal.");
  const [, sign, whole = "0", fraction = "", leadingFraction, exponent = "0"] =
    match;
  const digits = leadingFraction || fraction;
  const power = Number(exponent) - digits.length;
  if (!Number.isSafeInteger(power) || Math.abs(power) > 1024)
    throw new OutOfRangeError("Decimal exponent is too large.");
  const coefficient = BigInt(`${sign}${whole}${digits}`);
  return power >= 0 ?
      rational(coefficient * 10n ** BigInt(power))
    : rational(coefficient, 10n ** BigInt(-power));
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
// Matches DynamoDB's decimal range; insignificant trailing zeroes do not count.
export const storageDecimal = (text: string): string => {
  const value = parse(text);
  if (value.numerator === 0n) return "0";
  const canonical = decimalText(value);
  const digits = canonical
    .replace(/[-.]/g, "")
    .replace(/^0+/, "")
    .replace(/0+$/, "");
  const magnitude = canonical.replace(/^-/, "");
  const [whole, fraction = ""] = magnitude.split(".");
  const exponent =
    whole !== "0" ? whole.length - 1 : -1 - fraction.search(/[1-9]/);
  if (digits.length > 38 || exponent < -130 || exponent > 125)
    throw new OutOfRangeError(
      "Decimal exceeds the supported range or precision.",
    );
  return canonical;
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
  if (text.length > 1024) throw new OutOfRangeError("Calculation is too long.");
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
