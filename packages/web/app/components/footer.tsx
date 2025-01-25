import classNames from "classnames";

interface FooterProps {
  className?: string;
}

export function Footer({ className }: FooterProps) {
  const year = new Date().getFullYear();
  const version = import.meta.env.VITE_APP_VERSION || "unknown";
  return (
    <footer
      className={classNames(className, "bg-brand-500 px-4 py-8 text-white")}
    >
      <div className="container">
        <p>© {year} Santeri Consulting Oy and Tasan.app developers</p>
        <p>There | might | be | some | links | here | at | some | point</p>
        <p>Version {version}</p>
      </div>
    </footer>
  );
}
