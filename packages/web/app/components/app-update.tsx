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
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [visible, setVisible] = useState(false);

  // Keep edited forms intact, including after a failed submission. A completed
  // navigation to another page makes it safe to reload again. Submissions and
  // query/hash changes can keep the same form, so do not clear it for those.
  useEffect(() => {
    dirty.current = false;
    const onEdit = (event: Event) => {
      if (event.target instanceof Element && event.target.closest("form")) {
        dirty.current = true;
      }
    };
    document.addEventListener("input", onEdit, true);
    document.addEventListener("change", onEdit, true);
    return () => {
      document.removeEventListener("input", onEdit, true);
      document.removeEventListener("change", onEdit, true);
    };
  }, [location.pathname]);

  useEffect(() => {
    const controller = new AbortController();
    const checkVersion = async () => {
      const isVisible = document.visibilityState === "visible";
      setVisible(isVisible);
      if (!isVisible || !import.meta.env.VITE_APP_VERSION) return;
      try {
        const response = await fetch("/version", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (!response.ok) return;
        const result: unknown = await response.json();
        if (
          typeof result === "object" &&
          result !== null &&
          "version" in result &&
          typeof result.version === "string" &&
          result.version !== "" &&
          result.version !== import.meta.env.VITE_APP_VERSION
        ) {
          setUpdateAvailable(true);
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
      controller.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, []);

  useEffect(() => {
    if (!updateAvailable || !visible || busy || dirty.current) return;
    // Router state updates can be deferred by a React transition. Allow them to
    // settle, and recheck edits in case the user starts typing in the meantime.
    const timeout = window.setTimeout(() => {
      if (!dirty.current && document.visibilityState === "visible") {
        window.location.reload();
      }
    }, 1000);
    return () => {
      window.clearTimeout(timeout);
    };
  }, [updateAvailable, visible, busy, location.pathname]);

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
