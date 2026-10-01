# `@tasan/web`

The Tasan full-stack web application, built with React, React Router, and Tailwind CSS. It renders on the server and uses `@tasan/common` for shared domain logic and `@tasan/data` for persistence.

## Local development

Follow the [root setup guide](../../README.md) to install dependencies, configure the environment, and start DynamoDB Local.

Start the web development server:

```sh
pnpm dev
```

The application is available at [http://localhost:5173](http://localhost:5173).

Routes are registered in `app/routes.ts`. Route modules live in `app/routes/`, reusable UI in `app/components/`, and framework-independent application logic in `app/domain/`.

Application use cases are named functions grouped in `app/.server/services/splits.ts`, `expenses.ts`, `invites.ts`, and `users.ts`. They import persistence and exchange-rate functions directly. Routes authenticate the request, decode form data and IDs, call a use case, and handle expected errors with ordinary `try`/`catch`. Small response helpers map application errors to status responses or form errors; unexpected failures remain server errors.

Forms retain the explicit `splitName` and `expenseName` field names to discourage unrelated browser autocomplete suggestions. Routes map these fields to the application's `name` property and map validation errors back to the matching form fields.

Use cases own split membership checks, expense validation, exchange-rate selection, invitation expiry, and profile provisioning. Application tests live in `tests/services/`, grouped by module with explicit mocks for their dependencies. They use Node's built-in module mocks and a test-scoped clock for expiry checks. The web test command enables `--experimental-test-module-mocks`; include that flag when running an individual application test through `tsx --test`. Authentication tokens and session cookies remain the responsibility of the request adapters.

Split creation and invitation consumption are atomic persistence operations in `@tasan/data`. Invitation confirmation reads only split metadata. Expense creation derives the home currency from the stored split, requires the payer and participants to be members, and rejects amounts with precision unsupported by the expense currency.

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
