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
        <h1 className="">
          <Link to="/" variant="plain">
            <img src={logo} alt="logo" className="inline h-6 w-6" /> Tasan.app
          </Link>
        </h1>
        <p className="ml-auto">
          {user ?
            <>
              Hello, {user.name}! <Link to="/logout">Logout</Link>
            </>
          : <>
              <Link to="/login">Login</Link> |{" "}
              <Link to="/sign-up">Sign up</Link>
            </>
          }
        </p>
      </div>
    </header>
  );
}
