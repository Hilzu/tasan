import classNames from "classnames";
import { href } from "react-router";

import { Link } from "~/components/link";

interface FooterProps {
  className?: string;
  showSettings?: boolean;
}

export function Footer({ className, showSettings }: FooterProps) {
  const year = new Date().getFullYear();
  const version = import.meta.env.VITE_APP_VERSION || "unknown";
  return (
    <footer
      className={classNames(
        className,
        "bg-brand-700 dark:bg-brand-950 pt-8 pb-[calc(2rem+env(safe-area-inset-bottom))] text-white",
      )}
    >
      <div className="container space-y-2">
        <p>© {year} Santeri Consulting Oy and Tasan.app developers</p>
        {showSettings && (
          <p>
            <Link to={href("/settings")} variant="plain" className="underline">
              Regional settings
            </Link>
          </p>
        )}
        <p>Version {version}</p>
      </div>
    </footer>
  );
}
