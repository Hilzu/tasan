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
        "bg-brand-500 outline-brand-700 hover:bg-brand-600 cursor-pointer rounded px-3 py-1 text-center text-white focus:outline-2",
      )}
    >
      {children}
    </button>
  );
}
