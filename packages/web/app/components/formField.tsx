import { type ComponentProps, useId } from "react";

export interface FieldProps {
  label: string;
  description?: string;
  errors?: string[];
}

export function FieldError({ errors }: { errors: string[] }) {
  return (
    <div className="text-red-600">
      {errors.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
  );
}

export type FormFieldProps = FieldProps & ComponentProps<"input">;

export function FormField({ label, errors, ...rest }: FormFieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id}>{label}</label>
      <input
        {...rest}
        id={id}
        autoCapitalize={rest.autoCapitalize ?? "sentences"}
        className="outline-brand-700 rounded-sm border border-gray-500 px-2 py-1 focus:outline-2"
      />
      {errors && <FieldError errors={errors} />}
      {rest.description && <p className="text-sm">{rest.description}</p>}
    </div>
  );
}

export type TextFieldProps = FieldProps & ComponentProps<"textarea">;

export function TextField({ label, errors, ...rest }: TextFieldProps) {
  const id = useId();

  return (
    <div className="flex flex-col">
      <label htmlFor={id}>{label}</label>
      <textarea
        {...rest}
        id={id}
        rows={rest.rows ?? 3}
        cols={rest.cols ?? 40}
        autoCapitalize={rest.autoCapitalize ?? "sentences"}
        className="outline-brand-700 rounded-sm border border-gray-500 px-2 py-1 focus:outline-2"
      />
      {errors && <FieldError errors={errors} />}
      {rest.description && <p className="text-sm">{rest.description}</p>}
    </div>
  );
}
