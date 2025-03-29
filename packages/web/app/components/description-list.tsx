import classNames from "classnames";
import { Fragment, type ReactNode } from "react";

export const DescriptionList = ({
  items,
  className,
}: {
  items: [string, ReactNode][];
  className?: string;
}) => {
  return (
    <dl
      className={classNames(
        "grid grid-cols-[max-content_auto] gap-x-4",
        className,
      )}
    >
      {items.map(([key, value]) => (
        <Fragment key={key}>
          <dt className="font-semibold">{key}</dt>
          <dd>{value}</dd>
        </Fragment>
      ))}
    </dl>
  );
};
