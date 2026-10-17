import { href } from "react-router";

import { Link } from "~/components/link";

import logo from "./logo.svg?no-inline";

export const LandingPage = () => {
  return (
    <div className="flex flex-col px-4">
      <div className="mx-auto pt-8 text-center">
        <h1>
          <img
            src={logo}
            alt="Tasan"
            width={212}
            height={48}
            className="mx-auto h-auto w-64 max-w-full dark:brightness-0 dark:invert"
          />
        </h1>
        <p className="mt-4">Split bills with your friends</p>
      </div>
      <div className="mx-auto pt-4">
        <Link to={href("/splits")}>View your splits</Link>
      </div>
    </div>
  );
};
