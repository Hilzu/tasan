import classNames from "classnames";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary" | "danger";
};

export function Button({
  children,
  variant = "primary",
  disabled,
  ...rest
}: ButtonProps) {
  const type = rest.type ?? "button";
  return (
    <button
      {...rest}
      type={type}
      disabled={disabled}
      className={classNames(
        rest.className,
        "outline-brand-700 min-w-20 rounded px-3 py-1 text-center focus:outline-2",
        variant === "primary" &&
          "bg-brand-500 hover:bg-brand-600 active:bg-brand-700 dark:bg-brand-400 dark:hover:bg-brand-500 dark:active:bg-brand-600 text-white",
        variant === "secondary" &&
          "border-brand-500 border bg-white hover:bg-gray-100 active:bg-gray-200 dark:bg-gray-900 dark:hover:bg-gray-700 dark:active:bg-gray-600",
        variant === "danger" &&
          "border-red-500 bg-red-100 text-red-500 hover:bg-red-200 active:bg-red-300 dark:bg-red-900 dark:text-white dark:hover:bg-red-800 dark:active:bg-red-700",
        disabled ? "cursor-not-allowed opacity-50" : "cursor-pointer",
      )}
    >
      {children}
    </button>
  );
}
