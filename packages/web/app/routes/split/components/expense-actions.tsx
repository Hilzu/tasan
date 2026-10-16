import { useEffect, useRef } from "react";

import { Link } from "~/components/link";

interface ExpenseActionsProps {
  editHref: string;
  deleteDisabled: boolean;
  onDelete: () => void;
}

export function ExpenseActions({
  editHref,
  deleteDisabled,
  onDelete,
}: ExpenseActionsProps) {
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
        ref.current.open = false;
        ref.current.querySelector("summary")?.focus();
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
        aria-label="Expense actions"
        className="outline-brand-700 flex h-11 w-11 cursor-pointer list-none items-center justify-center rounded hover:bg-gray-100 focus-visible:outline-2 dark:hover:bg-gray-800 [&::-webkit-details-marker]:hidden"
      >
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
      </summary>
      <div className="absolute right-0 z-10 mt-1 min-w-32 rounded border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900">
        <Link
          to={editHref}
          variant="plain"
          className="block px-4 py-2 hover:bg-gray-100 focus-visible:bg-gray-100 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800"
          onClick={() => {
            if (ref.current) ref.current.open = false;
          }}
        >
          Edit
        </Link>
        <button
          type="button"
          className="block w-full cursor-pointer px-4 py-2 text-left text-red-600 hover:bg-gray-100 focus-visible:bg-gray-100 disabled:cursor-not-allowed disabled:opacity-50 dark:text-red-400 dark:hover:bg-gray-800 dark:focus-visible:bg-gray-800"
          disabled={deleteDisabled}
          onClick={() => {
            if (ref.current) ref.current.open = false;
            ref.current?.querySelector("summary")?.focus();
            onDelete();
          }}
        >
          Delete
        </button>
      </div>
    </details>
  );
}
