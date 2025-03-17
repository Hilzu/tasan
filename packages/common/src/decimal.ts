const toValue = (value: number | Decimal): number =>
  value instanceof Decimal ? value.value : value;

export class Decimal {
  private readonly _value: number;
  private readonly _fractions: number;

  constructor(value: number, fractions = 2) {
    this._value = Number(value.toFixed(fractions));
    this._fractions = fractions;
  }

  get value(): number {
    return this._value;
  }

  toString(): string {
    return this._value.toFixed(this._fractions);
  }

  equals(other: Decimal): boolean {
    return this._value === other._value;
  }

  add(other: Decimal | number): Decimal {
    return new Decimal(this._value + toValue(other), this._fractions);
  }

  sub(other: Decimal | number): Decimal {
    return new Decimal(this._value - toValue(other), this._fractions);
  }

  mul(other: Decimal | number): Decimal {
    return new Decimal(this._value * toValue(other), this._fractions);
  }

  div(other: Decimal | number): Decimal {
    return new Decimal(this._value / toValue(other), this._fractions);
  }
}
