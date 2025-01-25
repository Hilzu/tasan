import classNames from "classnames";
import type { ComponentProps } from "react";
import { Link as ReactRouterLink } from "react-router";

type Props = ComponentProps<typeof ReactRouterLink> & {
  variant?: "link" | "plain";
};

const linkClasses = "text-blue-600 dark:text-blue-500 hover:underline";

export const Link = (props: Props) => {
  const { variant = "link", className, ...rest } = props;

  return (
    <ReactRouterLink
      {...rest}
      className={classNames(className, variant === "link" && linkClasses)}
    />
  );
};
