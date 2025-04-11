import classNames from "classnames";
import type { ComponentProps } from "react";
import {
  Link as ReactRouterLink,
  NavLink as ReactRouterNavLink,
} from "react-router";

type LinkProps = ComponentProps<typeof ReactRouterLink> & {
  variant?: "link" | "plain";
};

const linkClasses = "text-blue-600 dark:text-blue-400 hover:underline";

export const Link = (props: LinkProps) => {
  const { variant = "link", className, ...rest } = props;

  return (
    <ReactRouterLink
      {...rest}
      viewTransition
      className={classNames(className, variant === "link" && linkClasses)}
    />
  );
};

type NavLinkProps = Omit<
  ComponentProps<typeof ReactRouterNavLink>,
  "className"
> & { className?: string };

export const NavLink = (props: NavLinkProps) => {
  const { className, ...rest } = props;

  return (
    <ReactRouterNavLink
      {...rest}
      viewTransition
      className={({ isActive }) =>
        classNames(className, isActive && "font-bold")
      }
    />
  );
};
