import classNames from "classnames";
import { useContext, useEffect, useState } from "react";
import {
  isRouteErrorResponse,
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
  useNavigation,
} from "react-router";

import { requestLogging } from "~/.server/request-logging";
import { AppUpdate } from "~/components/app-update";
import { NonceContext } from "~/context";

import type { Route } from "./+types/root";
import stylesheet from "./app.css?url";
import appleTouchIcon from "./marketing/apple-touch-icon.png?no-inline";
import favicon from "./marketing/favicon.svg?no-inline";
import faviconPNG from "./marketing/favicon-32.png?no-inline";

export const middleware: Route.MiddlewareFunction[] = [requestLogging];

export const links: Route.LinksFunction = () => [
  { rel: "stylesheet", href: stylesheet },
  { rel: "icon", href: "/favicon.ico", sizes: "16x16 32x32 48x48" },
  { rel: "icon", href: faviconPNG, type: "image/png", sizes: "32x32" },
  { rel: "icon", href: favicon, type: "image/svg+xml", sizes: "any" },
  { rel: "apple-touch-icon", href: appleTouchIcon, sizes: "180x180" },
];

export function Layout({ children }: { children: React.ReactNode }) {
  const nonce = useContext(NonceContext);
  return (
    <html lang="en" className="h-full">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <Meta />
        <Links nonce={nonce} />
      </head>
      <body className="bg-brand-canvas min-h-full text-gray-800 antialiased dark:bg-gray-950 dark:text-gray-100">
        {children}
        <ScrollRestoration nonce={nonce} />
        <Scripts nonce={nonce} />
      </body>
    </html>
  );
}

function GlobalLoadingIndicator() {
  const [opacity, setOpacity] = useState("opacity-0");
  useEffect(() => {
    setOpacity("opacity-50");
  }, []);
  return (
    <div
      className={classNames(
        "fixed inset-0 z-50 flex items-center justify-center bg-white transition-opacity delay-300 duration-150 dark:bg-gray-950",
        opacity,
      )}
    >
      <svg
        width="24"
        height="24"
        viewBox="0 0 24 24"
        xmlns="http://www.w3.org/2000/svg"
        className="h-8 w-8 text-gray-500 motion-safe:animate-spin dark:text-gray-400"
        fill="none"
        stroke="currentColor"
      >
        <path
          d="M12,1A11,11,0,1,0,23,12,11,11,0,0,0,12,1Zm0,19a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z"
          opacity=".25"
          fill="currentColor"
        />
        <path
          d="M10.14,1.16a11,11,0,0,0-9,8.92A1.59,1.59,0,0,0,2.46,12,1.52,1.52,0,0,0,4.11,10.7a8,8,0,0,1,6.66-6.61A1.42,1.42,0,0,0,12,2.69h0A1.57,1.57,0,0,0,10.14,1.16Z"
          fill="currentColor"
        />
      </svg>
    </div>
  );
}

export default function App() {
  const navigation = useNavigation();
  const isNavigating = Boolean(navigation.location);
  return (
    <>
      <AppUpdate />
      {isNavigating && <GlobalLoadingIndicator />}
      <Outlet />
    </>
  );
}

export function ErrorBoundary({ error }: Route.ErrorBoundaryProps) {
  let message = "Oopsie woopsie!";
  let details = "An unexpected error occurred.";
  let stack: string | undefined;

  if (isRouteErrorResponse(error)) {
    message = error.status === 404 ? "404" : "Error";
    details =
      error.status === 404 ?
        "The requested page could not be found."
      : error.statusText || details;
  } else if (import.meta.env.DEV && error && error instanceof Error) {
    details = error.message;
    stack = error.stack;
  }

  return (
    <main className="container mx-auto p-4 pt-16">
      <h1>{message}</h1>
      <p>{details}</p>
      {stack && (
        <pre className="w-full overflow-x-auto p-4">
          <code>{stack}</code>
        </pre>
      )}
    </main>
  );
}
