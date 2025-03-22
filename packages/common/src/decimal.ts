const toNumber = (value: number | Decimal): number =>
  typeof value === "number" ? value : value.value;

export type Decimal = Readonly<{ value: number; fractions: number }> & {
  __type: "Decimal";
};

export const create = (value: number, fractions = 2): Decimal => {
  return {
    value: Number(value.toFixed(fractions)),
    fractions,
  } as Decimal;
};

export const toString = (decimal: Decimal): string =>
  decimal.value.toFixed(decimal.fractions);

export const equals = (a: Decimal, b: Decimal): boolean => a.value === b.value;

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
