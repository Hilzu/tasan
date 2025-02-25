import type { User } from "@tasan/data";
import classNames from "classnames";

import { Link, NavLink } from "~/components/link";

import logo from "../marketing/logo.svg";

export interface HeaderProps {
  className?: string;
  user?: User;
}

export function Header({ className, user }: HeaderProps) {
  return (
    <header
      className={classNames(
        className,
        "border-b border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-900",
      )}
    >
      <div className="container flex py-4">
        <Link to="/" variant="plain">
          <img src={logo} alt="Tasan.app" className="h-6 w-6" />
        </Link>
        <NavLink to="/splits" className="ml-4">
          Splits
        </NavLink>
        <div className="ml-auto">
          {user ?
            <div className="flex gap-1">
              <p className="text-right">Hello, {user.name}!</p>
              <Link to="/logout">Logout</Link>
            </div>
          : <Link to="/login">Log in / Sign up</Link>}
        </div>
      </div>
    </header>
  );
}
