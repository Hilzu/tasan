import classNames from "classnames";
import type { ReactNode } from "react";

export interface MainHeadingProps {
  children: ReactNode;
  className?: string;
}

export function MainHeading({ children, className }: MainHeadingProps) {
  return (
    <h1 className={classNames(className, "mb-2 text-2xl font-semibold")}>
      {children}
    </h1>
  );
}
