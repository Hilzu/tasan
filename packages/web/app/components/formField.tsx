import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as Decimal from "@tasan/common/decimal";
import classNames from "classnames";
import {
  type ComponentProps,
  type ReactNode,
  useEffect,
  useId,
  useState,
} from "react";

export function FieldError({ errors }: { errors: string[] }) {
  return (
    <div className="text-red-600">
      {errors.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
  );
}

interface FieldProps {
  label: string;
  description?: string;
  errors?: string[];
}

function FormField({
  label,
  description,
  errors,
  children,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <label>{label}</label>
      {children}
      {errors && <FieldError errors={errors} />}
      {description && <p className="text-sm">{description}</p>}
    </div>
  );
}

type InputFieldProps = FieldProps &
  ComponentProps<"input"> & { leadingAddon?: ReactNode };

export function InputField({
  label,
  errors,
  description,
  leadingAddon,
  ...rest
}: InputFieldProps) {
  const id = useId();
  return (
    <FormField id={id} label={label} description={description} errors={errors}>
      <div className="outline-brand-700 flex items-center rounded-sm border border-gray-500 has-[input:focus-within]:outline-2">
        {leadingAddon && <div className="pl-2">{leadingAddon}</div>}
        <input
          {...rest}
          id={id}
          className="block min-w-0 grow px-2 py-1 focus:outline-none"
        />
      </div>
    </FormField>
  );
}

type CurrencyInputFieldProps = Omit<
  InputFieldProps,
  | "type"
  | "step"
  | "inputMode"
  | "min"
  | "pattern"
  | "onChange"
  | "onBlur"
  | "value"
  | "defaultValue"
> & {
  currencySymbol: CurrencySymbol;
  onDecimalChange: (value: Decimal.Decimal) => void;
  value?: Decimal.Decimal;
};

const parseNumber = (valueParam: string) => {
  let value = valueParam;
  const commaIndex = value.lastIndexOf(",");
  if (commaIndex !== -1)
    value = value.slice(0, commaIndex) + "." + value.slice(commaIndex + 1);

  return Number(value.replace(/[^0-9.]/g, ""));
};

export function CurrencyInputField({
  currencySymbol,
  onDecimalChange,
  value: valueProp,
  ...rest
}: CurrencyInputFieldProps) {
  const [value, setValue] = useState("");
  const { fractions } = currencies[currencySymbol];
  useEffect(() => {
    if (valueProp !== undefined) {
      setValue(Decimal.toString(valueProp));
    }
  }, [valueProp]);
  return (
    <InputField
      type="text"
      inputMode="decimal"
      pattern="\d+([.,]\d{0,2})?"
      leadingAddon={currencySymbol}
      value={value}
      onChange={(e) => {
        const newValue = e.target.value;
        setValue(newValue);
      }}
      onBlur={() => {
        const newValue = Decimal.create(parseNumber(value), fractions);
        setValue(Decimal.toString(newValue));
        onDecimalChange(newValue);
      }}
      {...rest}
    />
  );
}

type TextFieldProps = FieldProps & ComponentProps<"textarea">;

export function TextField({
  label,
  description,
  errors,
  ...rest
}: TextFieldProps) {
  const id = useId();
  return (
    <FormField id={id} label={label} description={description} errors={errors}>
      <textarea
        {...rest}
        id={id}
        rows={rest.rows ?? 3}
        cols={rest.cols ?? 40}
        autoCapitalize={rest.autoCapitalize ?? "sentences"}
        className="outline-brand-700 rounded-sm border border-gray-500 px-2 py-1 focus:outline-2"
      />
    </FormField>
  );
}

type SelectFieldProps = FieldProps & ComponentProps<"select">;

export function SelectField({
  label,
  description,
  errors,
  children,
  ...rest
}: SelectFieldProps) {
  const id = useId();
  return (
    <FormField id={id} label={label} description={description} errors={errors}>
      <select
        {...rest}
        id={id}
        className="outline-brand-700 rounded-sm border border-gray-500 px-2 py-1 focus:outline-2"
      >
        {children}
      </select>
    </FormField>
  );
}

function FieldSet({
  children,
  label,
  description,
  errors,
}: FieldProps & { children: ReactNode }) {
  return (
    <fieldset>
      <legend>{label}</legend>
      {children}
      {errors && <FieldError errors={errors} />}
      {description && <p className="text-sm">{description}</p>}
    </fieldset>
  );
}

type RadioInputProps = Omit<
  ComponentProps<"input">,
  "type" | "id" | "label" | "value"
> & {
  label: string;
  value: string;
};

type RadioGroupFieldProps = FieldProps & {
  items: RadioInputProps[];
  inline?: boolean;
};

export function RadioGroupField({
  label,
  description,
  errors,
  items,
  inline,
}: RadioGroupFieldProps) {
  return (
    <FieldSet label={label} description={description} errors={errors}>
      <div className={classNames("space-x-4", inline && "flex")}>
        {items.map(({ value, label, ...inputProps }) => {
          const id = useId();
          return (
            <div key={value} className="flex items-center space-x-1">
              <input id={id} type="radio" value={value} {...inputProps} />
              <label htmlFor={id}>{label}</label>
            </div>
          );
        })}
      </div>
    </FieldSet>
  );
}

export function CheckboxGroupField({
  label,
  description,
  errors,
  items,
  inline,
}: RadioGroupFieldProps) {
  return (
    <FieldSet label={label} description={description} errors={errors}>
      <div className={classNames("space-x-4", inline && "flex")}>
        {items.map(({ value, label, ...inputProps }) => {
          const id = useId();
          return (
            <div key={value} className="flex items-center space-x-1">
              <input id={id} type="checkbox" value={value} {...inputProps} />
              <label htmlFor={id}>{label}</label>
            </div>
          );
        })}
      </div>
    </FieldSet>
  );
}
