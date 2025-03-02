import { href } from "react-router";

import { Link } from "~/components/link";

import logo from "./logo.svg";

export const LandingPage = () => {
  return (
    <div className="flex flex-col px-4">
      <div className="mx-auto pt-8 text-center">
        <img src={logo} alt="Tasan.app" className="mx-auto h-24 w-24" />
        <h1 className="pt-1 text-4xl font-extrabold text-slate-800 dark:text-slate-300">
          Tasan.app
        </h1>
        <p>Split bills with your friends</p>
      </div>
      <div className="mx-auto pt-4">
        <Link to={href("/splits")}>View your splits</Link>
      </div>
    </div>
  );
};
