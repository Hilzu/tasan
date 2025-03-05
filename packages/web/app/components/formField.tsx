import { type ComponentProps, type ReactNode, useId } from "react";

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

type InputFieldProps = FieldProps & ComponentProps<"input">;

export function InputField({
  label,
  errors,
  description,
  ...rest
}: InputFieldProps) {
  const id = useId();
  return (
    <FormField id={id} label={label} description={description} errors={errors}>
      <input
        {...rest}
        id={id}
        className="outline-brand-700 rounded-sm border border-gray-500 px-2 py-1 focus:outline-2"
      />
    </FormField>
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
