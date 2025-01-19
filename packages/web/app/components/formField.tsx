import { type ComponentProps, useId } from "react";

export type FieldProps = ComponentProps<"input"> & {
  label: string;
  description?: string;
  errors?: string[];
};

export function FieldError({ errors }: { errors: string[] }) {
  return (
    <div className="text-red-600">
      {errors.map((error) => (
        <p key={error}>{error}</p>
      ))}
    </div>
  );
}

export function FormField({ label, errors, ...rest }: FieldProps) {
  const id = useId();
  return (
    <div className="flex flex-col">
      <label htmlFor={id}>{label}</label>
      <input
        {...rest}
        id={id}
        className="rounded border px-2 py-1 focus:outline-2"
      />
      {errors && <FieldError errors={errors} />}
      {rest.description && <p className="text-sm">{rest.description}</p>}
    </div>
  );
}
