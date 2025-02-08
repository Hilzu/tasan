import classNames from "classnames";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary";
};

export function Button({
  children,
  variant = "primary",
  ...rest
}: ButtonProps) {
  const type = rest.type ?? "button";
  return (
    <button
      {...rest}
      type={type}
      className={classNames(
        rest.className,
        "outline-brand-700 min-w-20 cursor-pointer rounded px-3 py-1 text-center focus:outline-2",
        variant === "primary" && "bg-brand-500 hover:bg-brand-600 text-white",
        variant === "secondary" &&
          "border-brand-500 border bg-white hover:bg-gray-100 dark:bg-gray-900 dark:hover:bg-gray-700",
      )}
    >
      {children}
    </button>
  );
}
