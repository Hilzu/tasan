import classNames from "classnames";
import type { ReactNode } from "react";

interface CardProps {
  className?: string;
  heading: ReactNode;
  action?: ReactNode;
  children: ReactNode;
}

export function Card({ className, heading, action, children }: CardProps) {
  return (
    <section className={classNames(className, "mb-2")}>
      <div className="flex justify-between">
        {heading}
        {action}
      </div>
      <div>{children}</div>
    </section>
  );
}
