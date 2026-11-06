import classNames from "classnames";
import type { ComponentProps, ReactNode } from "react";

// The tinted panel that holds an example on the landing page.
export function ExampleFrame({ children }: { children: ReactNode }) {
  return (
    <div className="bg-brand-100/70 dark:bg-brand-950 -mx-4 min-w-0 rounded-3xl p-4 min-[380px]:mx-0 sm:p-7">
      {children}
    </div>
  );
}

// The app-like card inside an ExampleFrame.
export function ExampleCard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={classNames(
        "bg-brand-canvas rounded-lg border border-gray-200 p-4 sm:p-6 dark:border-gray-700 dark:bg-gray-950",
        className,
      )}
    />
  );
}

// The note under an ExampleCard.
export function ExampleCaption({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      {...props}
      className={classNames(
        "text-brand-800 dark:text-brand-200 mt-4 text-center text-xs leading-relaxed",
        className,
      )}
    />
  );
}
