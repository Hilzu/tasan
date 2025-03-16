const toValue = (value: number | Decimal) =>
  value instanceof Decimal ? value.value : value;

export class Decimal {
  private readonly _value: number;
  private readonly _fractions: number;

  constructor(value: number, fractions = 2) {
    this._value = Number(value.toFixed(fractions));
    this._fractions = fractions;
  }

  get value() {
    return this._value;
  }

  toString() {
    return this._value.toFixed(this._fractions);
  }

  equals(other: Decimal) {
    return this._value === other._value;
  }

  add(other: Decimal | number) {
    return new Decimal(this._value + toValue(other), this._fractions);
  }

  sub(other: Decimal | number) {
    return new Decimal(this._value - toValue(other), this._fractions);
  }

  div(other: Decimal | number) {
    return new Decimal(this._value / toValue(other), this._fractions);
  }
}
