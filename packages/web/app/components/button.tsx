import classNames from "classnames";
import type { ComponentProps } from "react";

type ButtonProps = ComponentProps<"button">;

export function Button({ children, ...rest }: ButtonProps) {
  const type = rest.type ?? "button";
  return (
    <button
      {...rest}
      type={type}
      className={classNames(
        rest.className,
        "rounded bg-brand-500 px-3 py-1 text-center text-white outline-brand-700 hover:bg-brand-600 focus:outline-2",
      )}
    >
      {children}
    </button>
  );
}
