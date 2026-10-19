# `@tasan/web`

The Tasan full-stack web application, built with React, React Router, and Tailwind CSS. It renders on the server and uses `@tasan/common` for shared domain logic and `@tasan/data` for persistence.

## Local development

Follow the [root setup guide](../../README.md) to install dependencies, configure the environment, and start DynamoDB Local.

Start the web development server:

```sh
pnpm dev
```

The application is available at [http://localhost:5173](http://localhost:5173).

## Environment

Copy `example.env` to `.env` for local development. The main application settings are:

- `ORIGIN_URL` — public origin of the application.
- `AUTH_SERVER_URL` and `AUTH_CLIENT_ID` — OpenID Connect provider configuration.
- `AUTH_DISABLE` — optionally disable authentication when set to a non-empty value.
- `APP_ENV` — application environment; defaults to `local`.
- `TABLE_NAME` — DynamoDB table used by `@tasan/data`.
- `POWERTOOLS_LOG_LEVEL` — logging verbosity (defaults to `INFO`); `POWERTOOLS_DEV=true` enables indented JSON for local debugging.

The AWS SDK also reads its credential, region, and endpoint configuration from the environment. Do not commit `.env` or real credentials.

## Commands

- `pnpm dev` — start the development server with hot module replacement.
- `pnpm build` — generate route types and create a production build.
- `pnpm test` — run the package's tests.
- `pnpm clean` — remove generated output and caches.

Generated output is written to `.react-router/`, `build/`, and `dist/`; edit files in `app/` instead.

## Expense submission and retries

New expenses use a browser-generated expense ID kept for the lifetime of the mounted form. Submissions and retries from that form use the same ID. Validation errors leave the form editable, and successful creation redirects to the split. Reloading or remounting the form resets its values and ID; submissions are not persisted for recovery. If a response is lost and the form is reloaded, re-entering the expense can create a duplicate because it uses a new ID.

The server conditionally inserts the expense. Expense lookups use eventually consistent reads by default. Only the duplicate lookup following a failed conditional insert uses a strongly consistent read, so it sees the committed expense immediately. The first accepted creation for an expense ID wins: repeated submissions from the same actor return the original ID, even if the payload differs, without changing the expense, exchange rate, or deletion state. Each intentional new operation must use a fresh ID. Client IDs must have the exact prefix, length, and lowercase ULID alphabet, with no whitespace or suffixes. ULID timestamps are unrestricted; ID-based ordering may reflect client clock skew. Ownership and acceptance timestamps come from the authenticated session and server, and split membership is checked before looking up or creating expenses. Reusing an existing ID with a different actor returns HTTP 409. Existing expenses need no migration; they remain readable and cannot be overwritten through creation.

This protection currently covers expense creation. Future append-only edits should have their own client-generated event IDs.

## Brand assets

The equal-shares logo uses four identical rounded tiles inspired by 田 (a rice field). Editable SVG artwork lives in `app/marketing/`: `logo.svg` contains the outlined wordmark, `favicon.svg` is optimized for browser tabs and adapts to the system color scheme, and `app-icon.svg` is the source for the opaque Apple touch icon. The wordmark has no font dependency.

When changing the artwork, export `app-icon.svg` at 180 × 180 to `apple-touch-icon.png`, render the favicon geometry with off-white tiles on a teal background at 32 × 32 to `favicon-32.png`, and refresh `public/favicon.ico` with the same artwork at 16, 32, and 48 pixels. The opaque PNG and ICO fallbacks remain visible in either browser theme. Imported icons receive Vite content hashes and use the existing CloudFront assets route.

Brand colors are defined in `app/app.css`: deep teal `#155b52` (`brand-700`), warm off-white `#faf8f2` (`brand-canvas`), and a supporting teal scale. Light mode uses dark teal controls with white text; dark mode uses pale teal controls with dark text.
