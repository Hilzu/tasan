import classNames from "classnames";
import type { ComponentProps } from "react";
import {
  Link as ReactRouterLink,
  NavLink as ReactRouterNavLink,
} from "react-router";

type LinkProps = ComponentProps<typeof ReactRouterLink> & {
  variant?: "link" | "plain";
};

const linkClasses =
  "text-brand-700 dark:text-brand-300 hover:underline active:text-brand-900 dark:active:text-brand-200 active:underline";

export const Link = (props: LinkProps) => {
  const { variant = "link", className, ...rest } = props;

  return (
    <ReactRouterLink
      {...rest}
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
      className={({ isActive }) =>
        classNames(className, isActive && "font-bold")
      }
    />
  );
};
