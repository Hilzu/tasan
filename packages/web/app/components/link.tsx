import classNames from "classnames";
import type { ComponentProps } from "react";
import { Link as ReactRouterLink } from "react-router";

type Props = ComponentProps<typeof ReactRouterLink>;

const linkClasses = "text-blue-600 hover:underline";

export const Link = (props: Props) => (
  <ReactRouterLink
    {...props}
    className={classNames(props.className, linkClasses)}
  />
);
