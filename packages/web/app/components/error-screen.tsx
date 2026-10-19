import { useEffect, useId, useState } from "react";
import { href, isRouteErrorResponse, useMatches } from "react-router";

import { Button } from "~/components/button";
import { MainHeading, SubHeading } from "~/components/heading";
import { errorDetails } from "~/domain/error-report";

export function ErrorScreen({ error }: { error: unknown }) {
  const details = errorDetails(error);
  const matches = useMatches();
  const descriptionID = useId();
  const [authenticated, setAuthenticated] = useState<boolean>();
  const [description, setDescription] = useState("");
  const [state, setState] = useState<"idle" | "sending" | "sent" | "failed">(
    "idle",
  );
  const [reportID, setReportID] = useState("");
  const [failure, setFailure] = useState("");
  const notFound = isRouteErrorResponse(error) && error.status === 404;

  useEffect(() => {
    const controller = new AbortController();
    void fetch(href("/error-report"), {
      signal: controller.signal,
      cache: "no-store",
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("Unable to check session");
        const result: unknown = await response.json();
        setAuthenticated(
          typeof result === "object" &&
            result !== null &&
            "authenticated" in result &&
            result.authenticated === true,
        );
      })
      .catch(() => {
        if (!controller.signal.aborted) setAuthenticated(false);
      });
    return () => {
      controller.abort();
    };
  }, []);

  async function sendReport(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    if (state === "sending" || state === "sent") return;
    setState("sending");
    setFailure("");
    try {
      // Plain fetch leaves the original error screen and description intact if
      // reporting fails, and does not revalidate the route that just crashed.
      const response = await fetch(href("/error-report"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          error: details,
          route: matches.at(-1)?.id ?? "root",
          version: import.meta.env.VITE_APP_VERSION || "local",
        }),
      });
      if (response.status === 401) {
        setFailure(
          "Your session has expired. Sign in again before sending a report.",
        );
        setState("failed");
        return;
      }
      if (!response.ok) throw new Error("Report rejected");
      const result: unknown = await response.json();
      if (
        typeof result !== "object" ||
        result === null ||
        !("reportID" in result) ||
        typeof result.reportID !== "string"
      ) {
        throw new Error("Invalid report response");
      }
      setReportID(result.reportID);
      setState("sent");
    } catch {
      setFailure(
        "The report could not be sent. Your description is still here; please try again.",
      );
      setState("failed");
    }
  }

  return (
    <main className="container py-12 sm:py-20">
      <div className="mx-auto max-w-xl space-y-6">
        <div>
          <p className="text-brand-700 dark:text-brand-300 mb-3 text-sm font-semibold">
            Tasan
          </p>
          <MainHeading>
            {notFound ? "Page not found" : "Something went wrong"}
          </MainHeading>
          <p>
            {notFound ?
              "The requested page could not be found."
            : "We couldn’t complete this action. You can try again or return to the home page."
            }
          </p>
          <a
            className="text-brand-700 dark:text-brand-300 mt-4 inline-block underline"
            href="/"
          >
            Return to home page
          </a>
        </div>

        <details className="rounded-lg border border-gray-300 bg-white dark:border-gray-700 dark:bg-gray-900">
          <summary className="cursor-pointer px-4 py-3 font-medium">
            Technical details
          </summary>
          <div className="space-y-3 border-t border-gray-300 p-4 text-sm dark:border-gray-700">
            <p className="font-medium break-words">
              {details.name}: {details.message}
            </p>
            {details.stack ?
              <pre className="max-h-64 overflow-auto rounded bg-gray-50 p-3 text-xs dark:bg-gray-950">
                <code>{details.stack}</code>
              </pre>
            : <p>
                No stack trace is available in the browser. Server error details
                are kept in the server logs.
              </p>
            }
          </div>
        </details>

        {authenticated === true && (
          <section
            className="rounded-lg border border-gray-300 bg-white p-5 dark:border-gray-700 dark:bg-gray-900"
            aria-label="Error report"
          >
            {state === "sent" ?
              <div role="status" className="space-y-2">
                <SubHeading>Thanks for your report</SubHeading>
                <p>
                  Your report has been sent and will help us fix the problem.
                </p>
                <p className="text-sm break-all text-gray-600 dark:text-gray-300">
                  Report reference: {reportID}
                </p>
              </div>
            : <form
                onSubmit={(event) => {
                  void sendReport(event);
                }}
                className="space-y-4"
              >
                <SubHeading>Help us fix this</SubHeading>
                <div className="space-y-2">
                  <label className="block font-medium" htmlFor={descriptionID}>
                    What were you doing?{" "}
                    <span className="text-sm font-normal text-gray-600 dark:text-gray-300">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id={descriptionID}
                    name="description"
                    rows={4}
                    maxLength={2000}
                    value={description}
                    onChange={(event) => {
                      setDescription(event.target.value);
                    }}
                    disabled={state === "sending"}
                    placeholder="Tell us what happened just before the error…"
                    className="focus:outline-brand-700 dark:focus:outline-brand-300 block w-full resize-y rounded border border-gray-500 p-3 focus:outline-2"
                  />
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-300">
                  Sends your description, the technical details above, and the
                  app version to Tasan’s diagnostic logs in AWS. The report is
                  linked to your signed-in account. Please don’t include
                  passwords or sensitive information.
                </p>
                {failure && (
                  <p
                    role="alert"
                    className="text-sm text-red-600 dark:text-red-400"
                  >
                    {failure}
                  </p>
                )}
                <Button type="submit" disabled={state === "sending"}>
                  {state === "sending" ? "Sending…" : "Send error report"}
                </Button>
              </form>
            }
          </section>
        )}
        {authenticated === false && (
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Error reporting is available when you’re signed in.
          </p>
        )}
      </div>
    </main>
  );
}
