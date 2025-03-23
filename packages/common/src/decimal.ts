const toNumber = (value: number | Decimal): number =>
  typeof value === "number" ? value : value.value;

export type Decimal = Readonly<{ value: number; fractions: number }>;

export const create = (value: Decimal | number, fractions = 2): Decimal => {
  return {
    value: Number(toNumber(value).toFixed(fractions)),
    fractions,
  } as Decimal;
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
