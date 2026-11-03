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
  isLandingPage?: boolean;
}

export function Header({ className, user, split, isLandingPage }: HeaderProps) {
  return (
    <header
      className={classNames(
        className,
        "pt-[env(safe-area-inset-top)]",
        isLandingPage ?
          "bg-brand-canvas dark:bg-gray-950"
        : "border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900",
      )}
    >
      <div
        className={classNames(
          "container flex flex-wrap items-center gap-y-2",
          isLandingPage ? "gap-x-3 py-6 sm:gap-x-4" : "gap-x-4 py-4",
        )}
      >
        <Link to={href("/")} variant="plain" className="shrink-0">
          <img
            src={logo}
            alt="Tasan"
            width={212}
            height={48}
            className={classNames(
              isLandingPage ? "h-5 min-[380px]:h-7" : "h-6",
              "w-auto dark:brightness-0 dark:invert",
            )}
          />
        </Link>
        <NavLink
          to={href("/splits")}
          className={classNames(
            "shrink-0",
            isLandingPage &&
              "ml-auto inline-flex min-h-11 items-center text-sm",
          )}
        >
          {isLandingPage ? "Your splits" : "Splits"}
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
        <div className={classNames("shrink-0", !isLandingPage && "ml-auto")}>
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
              items={[
                { label: "Settings", to: href("/settings") },
                { label: "Log out", to: href("/logout") },
              ]}
            />
          : <Link
              to={href("/login")}
              className={
                isLandingPage ?
                  "border-brand-700/30 dark:border-brand-300/40 inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium sm:px-4"
                : undefined
              }
            >
              Log in
            </Link>
          }
        </div>
      </div>
    </header>
  );
}
