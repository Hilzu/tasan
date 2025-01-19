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
        "rounded border px-2 py-1 hover:bg-gray-200 focus:outline-2",
      )}
    >
      {children}
    </button>
  );
}
