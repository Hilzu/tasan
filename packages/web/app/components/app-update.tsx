import { useEffect, useRef, useState } from "react";
import { useFetchers, useLocation, useNavigation } from "react-router";

import { Button } from "~/components/button";

export function AppUpdate() {
  const location = useLocation();
  const navigation = useNavigation();
  const fetchers = useFetchers();
  const busy =
    navigation.state !== "idle" ||
    fetchers.some((fetcher) => fetcher.state !== "idle");
  const dirty = useRef(false);
  const reloadAllowed = useRef(false);
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [canReload, setCanReload] = useState(false);

  // Keep edited forms and submission results (such as invite links) intact.
  // Only navigating to another page clears this guard; failed submissions and
  // query/hash changes can keep the same form.
  useEffect(() => {
    dirty.current = false;
    const onEdit = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("form")) {
        dirty.current = true;
      }
    };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    document.addEventListener("submit", onEdit, true);
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
      document.removeEventListener("submit", onEdit, true);
    };
  }, [location.pathname]);

  useEffect(() => {
    let controller: AbortController | undefined;
    const checkVersion = async () => {
      controller?.abort();
      reloadAllowed.current = false;
      setCanReload(false);
      if (
        document.visibilityState !== "visible" ||
        !import.meta.env.VITE_APP_VERSION
      )
        return;
      const currentController = new AbortController();
      controller = currentController;
      try {
        const response = await fetch("/version", {
          cache: "no-store",
          signal: currentController.signal,
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          typeof result === "object" &&
          result !== null &&
          "version" in result &&
          typeof result.version === "string" &&
          result.version !== "" &&
          !currentController.signal.aborted
        ) {
          const outdated = result.version !== import.meta.env.VITE_APP_VERSION;
          setUpdateAvailable(outdated);
          reloadAllowed.current = outdated;
          setCanReload(outdated);
        }
      } catch {
        // A failed update check must not interrupt offline or normal use.
      }
    };
    const onVisibilityChange = () => {
      void checkVersion();
    };
    onVisibilityChange();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!canReload || busy || dirty.current) return;
    // Router state updates can be deferred by a React transition. Allow them to
    // settle, and recheck edits in case the user starts typing in the meantime.
    const timeout = window.setTimeout(() => {
      if (
        reloadAllowed.current &&
        !dirty.current &&
        document.visibilityState === "visible"
      ) {
        window.location.reload();
      }
    }, 1000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [canReload, busy, location.pathname]);

  if (!updateAvailable) return null;
  return (
    <div
      role="status"
      className="border-brand-500 bg-brand-50 dark:bg-brand-950 fixed right-4 bottom-4 left-4 z-50 mx-auto flex max-w-xl items-center gap-4 rounded border p-4 shadow-lg"
    >
      <p>
        A new version of Tasan is available. Reloading will discard any unsaved
        changes.
      </p>
      <Button
        disabled={busy}
        onClick={() => {
          window.location.reload();
        }}
      >
        Reload
      </Button>
    </div>
  );
}
