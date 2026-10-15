export function loader() {
  return Response.json(
    { version: import.meta.env.VITE_APP_VERSION || "local" },
    { headers: { "Cache-Control": "no-store" } },
  );
}
