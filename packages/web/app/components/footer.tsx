import classNames from "classnames";
import { href } from "react-router";

import { Link } from "~/components/link";

import logo from "../marketing/logo.svg?no-inline";

interface FooterProps {
  className?: string;
  showSettings?: boolean;
}

export function Footer({ className, showSettings }: FooterProps) {
  const year = new Date().getFullYear();
  const version = import.meta.env.VITE_APP_VERSION || "unknown";
  const linkClasses =
    "inline-flex min-h-11 items-center text-sm font-medium text-brand-50 underline-offset-4 outline-brand-200 hover:text-white hover:underline focus-visible:outline-2 focus-visible:outline-offset-4";
  return (
    <footer
      className={classNames(
        className,
        "bg-brand-800 dark:bg-brand-950 pt-10 pb-[calc(1.5rem+env(safe-area-inset-bottom))] text-white",
      )}
    >
      <div className="container">
        <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center sm:gap-8">
          <div>
            <Link
              to={href("/")}
              variant="plain"
              className="outline-brand-200 inline-flex min-h-11 items-center rounded focus-visible:outline-2 focus-visible:outline-offset-4"
            >
              <img
                src={logo}
                alt="Tasan home"
                width={212}
                height={48}
                className="h-7 w-auto brightness-0 invert"
              />
            </Link>
            <p className="text-brand-100 mt-2 text-sm">
              Good times. All square.
            </p>
          </div>
          <nav aria-label="Footer">
            <ul className="flex flex-wrap gap-x-6 gap-y-2">
              <li>
                <a
                  className={linkClasses}
                  href="https://github.com/Hilzu/tasan/issues"
                >
                  Feedback
                </a>
              </li>
              <li>
                <a
                  className={linkClasses}
                  href="https://github.com/Hilzu/tasan"
                >
                  Source code
                </a>
              </li>
              <li>
                <Link
                  to={href("/privacy")}
                  variant="plain"
                  className={linkClasses}
                >
                  Privacy
                </Link>
              </li>
              {showSettings && (
                <li>
                  <Link
                    to={href("/settings")}
                    variant="plain"
                    className={linkClasses}
                  >
                    Settings
                  </Link>
                </li>
              )}
            </ul>
          </nav>
        </div>
        <div className="border-brand-300/20 text-brand-100 mt-7 flex flex-col justify-between gap-3 border-t pt-5 text-xs leading-relaxed sm:flex-row sm:items-baseline sm:gap-6">
          <p>© {year} Santeri Consulting Oy and Tasan.app developers</p>
          <p className="text-brand-200 shrink-0 font-mono text-[11px]">
            Version {version}
          </p>
        </div>
      </div>
    </footer>
  );
}
