import type { Split, User } from "@tasan/data";
import classNames from "classnames";
import { href } from "react-router";

import { ActionsDropdown } from "~/components/actions-dropdown";
import { Link, NavLink } from "~/components/link";

import logo from "../marketing/logo.svg?no-inline";

export interface HeaderProps {
  className?: string;
  user?: User;
  split?: Pick<Split, "id" | "name">;
}

export function Header({ className, user, split }: HeaderProps) {
  return (
    <header
      className={classNames(
        className,
        "border-b border-gray-200 bg-gray-50 pt-[env(safe-area-inset-top)] dark:border-gray-700 dark:bg-gray-900",
      )}
    >
      <div className="container flex flex-wrap items-center gap-x-4 gap-y-2 py-4">
        <Link to={href("/")} variant="plain" className="shrink-0">
          <img
            src={logo}
            alt="Tasan"
            width={212}
            height={48}
            className="h-6 w-auto dark:brightness-0 dark:invert"
          />
        </Link>
        <NavLink to={href("/splits")} className="shrink-0">
          Splits
        </NavLink>
        {split && (
          <NavLink
            to={href("/splits/:splitID", { splitID: split.id })}
            title={split.name}
            className="order-last w-full truncate sm:order-none sm:w-auto sm:min-w-0 sm:flex-1"
          >
            {split.name}
          </NavLink>
        )}
        <div className="ml-auto shrink-0">
          {user ?
            <ActionsDropdown
              label={`Account menu for ${user.name}`}
              heading={user.name}
              trigger={
                <span
                  aria-hidden="true"
                  className="bg-brand-100 text-brand-800 dark:bg-brand-800 dark:text-brand-100 flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold"
                >
                  {Array.from(user.name.trim())[0]?.toUpperCase() || "?"}
                </span>
              }
              items={[{ label: "Log out", to: href("/logout") }]}
            />
          : <Link to={href("/login")}>Log in</Link>}
        </div>
      </div>
    </header>
  );
}
