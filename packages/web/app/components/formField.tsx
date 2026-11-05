import { currencies, type CurrencySymbol } from "@tasan/common/currency";
import * as M from "@tasan/common/money";
import classNames from "classnames";
import {
  type ComponentProps,
  type ReactNode,
  useId,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import { flushSync } from "react-dom";

import { useLanguage } from "~/context";

export function FieldError({ errors }: { errors: string[] }) {
  return (
    <div className="text-red-600 dark:text-red-400">
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
  id,
}: FieldProps & { id: string; children: ReactNode }) {
  return (
    <div className="flex flex-col">
      <label htmlFor={id}>{label}</label>
      {children}
      {errors && <FieldError errors={errors} />}
      {description && <p className="text-sm">{description}</p>}
    </div>
  );
}

type InputFieldProps = FieldProps &
  ComponentProps<"input"> & {
    leadingAddon?: ReactNode;
    trailingAddon?: ReactNode;
  };

export function InputField({
  label,
  errors,
  description,
  leadingAddon,
  trailingAddon,
  ...rest
}: InputFieldProps) {
  const id = useId();
  return (
    <FormField id={id} label={label} description={description} errors={errors}>
      <div className="outline-brand-700 dark:outline-brand-300 flex items-center rounded-sm border border-gray-500 has-[input:focus-within]:outline-2">
        {leadingAddon && <div className="pl-2">{leadingAddon}</div>}
        <input
          {...rest}
          id={id}
          className="block min-w-0 grow px-2 py-1 focus:outline-none"
        />
        {trailingAddon}
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
  | "onKeyDown"
  | "value"
  | "defaultValue"
> & {
  currencySymbol: CurrencySymbol;
  onValueChange: (value: AmountInput) => void;
  value: AmountInput;
  automaticAmount?: M.Money;
  // Shows a sign toggle, since mobile decimal keypads may lack a minus key.
  allowNegative?: boolean;
};

export interface AmountInput {
  text: string;
  expressionMode: boolean;
}

export const emptyAmountInput: AmountInput = {
  text: "",
  expressionMode: false,
};

// Keep the existing lenient currency input, retaining decimal text throughout.
export const parseNumber = (valueParam: string): string => {
  let value = valueParam;
  const commaIndex = value.lastIndexOf(",");
  if (commaIndex !== -1)
    value = value.slice(0, commaIndex) + "." + value.slice(commaIndex + 1);
  const digits = value.replace(/[^0-9.]/g, "") || "0";
  return value.trim().startsWith("-") ? `-${digits}` : digits;
};

// Resolves field input into an amount rounded to the currency's precision.
// Blank input has neither an amount nor an error.
export const readAmountInput = (
  value: string,
  expressionMode: boolean,
  currency: CurrencySymbol,
): { amount?: M.Money; error: string } => {
  if (value.trim() === "") return { error: "" };
  try {
    return {
      amount:
        expressionMode ?
          M.calculate(value, currency)
        : M.round(parseNumber(value), currency),
      error: "",
    };
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return {
      error:
        error instanceof M.OutOfRangeError ?
          "Amount is too large or has too many digits."
        : expressionMode ? "Invalid calculation"
        : "Invalid amount",
    };
  }
};

export const resolveAmount = (
  value: string,
  expressionMode: boolean,
  currency: CurrencySymbol,
): M.Money | undefined =>
  readAmountInput(value, expressionMode, currency).amount;

// Currency changes normalize valid input while leaving blanks and errors intact.
export const normalizeAmountInput = (
  input: AmountInput,
  currency: CurrencySymbol,
  allowNegative = false,
): AmountInput => {
  const amount = resolveAmount(input.text, input.expressionMode, currency);
  return amount && (allowNegative || amount.minorUnits >= 0n) ?
      { ...input, text: M.toString(amount) }
    : input;
};

export function CurrencyInputField({
  currencySymbol,
  onValueChange,
  value,
  automaticAmount,
  allowNegative = false,
  name,
  errors,
  ...rest
}: CurrencyInputFieldProps) {
  const language = useLanguage();
  const [showInvalid, setShowInvalid] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { fractions } = currencies[currencySymbol];
  const { text, expressionMode } = value;
  const { amount: resolved, error: inputError } = readAmountInput(
    text,
    expressionMode,
    currencySymbol,
  );
  const empty = text.trim() === "";
  const validationError =
    inputError ? inputError
    : !allowNegative && resolved && resolved.minorUnits < 0n ?
      "Amount must not be negative."
    : "";
  const invalid = validationError !== "";
  const submittedAmount = empty ? automaticAmount : resolved;
  useLayoutEffect(() => {
    inputRef.current?.setCustomValidity(validationError);
  }, [validationError]);
  const commit = () => {
    setShowInvalid(invalid);
    if (invalid) return false;
    onValueChange({
      ...value,
      text: resolved ? M.toString(resolved) : "",
    });
    return true;
  };
  const allErrors = [
    ...(errors ?? []),
    ...(invalid && showInvalid ? [validationError] : []),
  ];
  return (
    <>
      {name && (
        <input
          type="hidden"
          name={name}
          value={submittedAmount ? M.toString(submittedAmount) : ""}
        />
      )}
      <InputField
        ref={inputRef}
        type="text"
        inputMode={expressionMode ? "text" : "decimal"}
        pattern={
          expressionMode ? undefined
          : allowNegative ?
            "-?\\d+([.,]\\d{0,2})?"
          : "\\d+([.,]\\d{0,2})?"
        }
        leadingAddon={currencySymbol}
        errors={allErrors.length ? allErrors : undefined}
        trailingAddon={
          <>
            {resolved !== undefined &&
              expressionMode &&
              /[+\-*/]/.test(text) && (
                <span className="pr-1 whitespace-nowrap text-gray-400">
                  ={" "}
                  {M.formatDecimal(
                    M.toString(resolved),
                    new Intl.NumberFormat(language, {
                      minimumFractionDigits: fractions,
                      maximumFractionDigits: fractions,
                    }),
                  )}
                </span>
              )}
            {allowNegative && (
              <button
                type="button"
                title="Toggle negative amount"
                className="mr-1 rounded-sm px-1.5 text-sm text-gray-500"
                onClick={() => {
                  onValueChange({
                    ...value,
                    text:
                      resolved ? M.toString(M.negate(resolved))
                      : empty ? "-"
                      : text,
                  });
                  inputRef.current?.focus();
                }}
              >
                ±
              </button>
            )}
            <button
              type="button"
              title="Enter a calculation"
              aria-pressed={expressionMode}
              className={classNames(
                "mr-1 rounded-sm px-1.5 text-sm",
                expressionMode ? "bg-brand-700 text-white" : "text-gray-500",
              )}
              onClick={() => {
                onValueChange({ ...value, expressionMode: !expressionMode });
                inputRef.current?.focus();
              }}
            >
              =
            </button>
          </>
        }
        value={text}
        onChange={(e) => {
          onValueChange({ ...value, text: e.target.value });
        }}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key !== "Enter") return;
          // Commit before submitting so the form posts resolved amounts.
          e.preventDefault();
          const input = e.currentTarget;
          if (flushSync(commit)) input.form?.requestSubmit();
          else input.reportValidity();
        }}
        {...rest}
      />
    </>
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
        className="outline-brand-700 dark:outline-brand-300 rounded-sm border border-gray-500 px-2 py-1 focus:outline-2"
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
        className="outline-brand-700 dark:outline-brand-300 rounded-sm border border-gray-500 px-2 py-1 focus:outline-2"
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
      <div className={classNames("space-x-4", inline && "flex flex-wrap")}>
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
      <div className={classNames("space-x-4", inline && "flex flex-wrap")}>
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
