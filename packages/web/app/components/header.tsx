import type { User } from "@tasan/data";
import classNames from "classnames";

import { Link } from "~/components/link";

export interface HeaderProps {
  className?: string;
  user: User;
}

export function Header({ className, user }: HeaderProps) {
  return (
    <header className={classNames(className, "")}>
      <div className="container flex py-4">
        <h1 className="">Tasan.app</h1>
        <p className="ml-auto">
          Hello, {user.name}! <Link to="/logout">Logout</Link>
        </p>
      </div>
    </header>
  );
}
