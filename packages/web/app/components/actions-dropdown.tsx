import classNames from "classnames";
import { type ReactNode, useEffect, useRef } from "react";
import type { To } from "react-router";

import { Link } from "~/components/link";

type DropdownItem = {
  label: string;
  destructive?: boolean;
} & (
  | { to: To; onSelect?: never; disabled?: never }
  | { to?: never; onSelect: () => void; disabled?: boolean }
);

interface ActionsDropdownProps {
  label: string;
  items: DropdownItem[];
  trigger?: ReactNode;
  heading?: string;
}

const closeDropdown = (details: HTMLDetailsElement | null) => {
  if (!details) return;
  details.open = false;
  details.querySelector("summary")?.focus();
};

export function ActionsDropdown({
  label,
  items,
  trigger,
  heading,
}: ActionsDropdownProps) {
  const ref = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const details = ref.current;
      if (
        details &&
        event.target instanceof Node &&
        !details.contains(event.target)
      )
        details.open = false;
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && ref.current?.open) {
        event.preventDefault();
        closeDropdown(ref.current);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

  return (
    <details ref={ref} className="relative">
      <summary
        aria-label={label}
        className="outline-brand-700 dark:outline-brand-300 flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded hover:bg-gray-100 focus-visible:outline-2 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden"
      >
        {trigger ?? (
          <svg
            width="20"
            height="20"
            viewBox="0 0 20 20"
            fill="currentColor"
            aria-hidden="true"
          >
            <circle cx="4" cy="10" r="1.5" />
            <circle cx="10" cy="10" r="1.5" />
            <circle cx="16" cy="10" r="1.5" />
          </svg>
        )}
      </summary>
      <div
        className={classNames(
          "absolute right-0 z-10 mt-1 min-w-32 rounded border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900",
          heading && "w-56 max-w-[calc(100vw-4rem)]",
        )}
      >
        {heading && (
          <p className="border-b border-gray-200 px-4 py-2 text-sm font-semibold break-words dark:border-gray-700">
            {heading}
          </p>
        )}
        {items.map((item) => {
          const className = classNames(
            "block w-full cursor-pointer px-4 py-2 text-left hover:bg-gray-100 focus-visible:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800",
            item.destructive && "text-red-600 dark:text-red-400",
          );
          return item.to !== undefined ?
              <Link
                key={item.label}
                to={item.to}
                variant="plain"
                className={className}
                onClick={() => {
                  closeDropdown(ref.current);
                }}
              >
                {item.label}
              </Link>
            : <button
                key={item.label}
                type="button"
                className={className}
                disabled={item.disabled}
                onClick={() => {
                  closeDropdown(ref.current);
                  item.onSelect();
                }}
              >
                {item.label}
              </button>;
        })}
      </div>
    </details>
  );
}
