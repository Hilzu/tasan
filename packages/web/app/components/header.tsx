import type { User } from "@tasan/data";
import classNames from "classnames";

import { Link } from "~/components/link";

import logo from "../marketing/logo.svg";

export interface HeaderProps {
  className?: string;
  user?: User;
}

export function Header({ className, user }: HeaderProps) {
  return (
    <header className={classNames(className, "")}>
      <div className="container flex py-4">
        <Link to="/" variant="plain">
          <img src={logo} alt="Tasan.app" className="inline h-6 w-6" />
        </Link>
        <div className="ml-auto">
          {user ?
            <div className="flex gap-1">
              <p className="text-right">Hello, {user.name}!</p>
              <Link to="/logout">Logout</Link>
            </div>
          : <>
              <Link to="/login">Login</Link> |{" "}
              <Link to="/sign-up">Sign up</Link>
            </>
          }
        </div>
      </div>
    </header>
  );
}
