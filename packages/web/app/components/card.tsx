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
      <div>
        <div className="float-right pl-2">{action}</div>
        <div>{heading}</div>
      </div>
      <div>{children}</div>
    </section>
  );
}
