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

The AWS SDK also reads its credential, region, and endpoint configuration from the environment. Do not commit `.env` or real credentials.

## Commands

- `pnpm dev` — start the development server with hot module replacement.
- `pnpm build` — generate route types and create a production build.
- `pnpm test` — run the package's tests.
- `pnpm clean` — remove generated output and caches.

Generated output is written to `.react-router/`, `build/`, and `dist/`; edit files in `app/` instead.

## Expense submission and retries

New expenses use a browser-generated expense ID. Before sending a submission, the browser saves its exact form payload in session storage, scoped to the signed-in user and split. A failed connection or reload can retry that payload with the same ID. Confirmed success clears the saved submission and returns to the split; validation errors allow a corrected submission with a new ID. Browser session storage must be available to submit an expense. Recovery lasts for the current tab session, not across closed tabs or devices.

The server conditionally inserts the expense and stores an immutable creation fingerprint. Repeated submissions from the same actor with the same input return the original ID without changing the expense, exchange rate, or deletion state. Reusing an existing ID with different input or a different actor returns HTTP 409. Existing expenses need no migration; they remain readable and cannot be overwritten through creation.

This protection currently covers expense creation. Future append-only edits should have their own client-generated event IDs.
