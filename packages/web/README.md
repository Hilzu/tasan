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
