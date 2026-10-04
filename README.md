# Tasan

This project was bootstrapped with [create-ts-node](https://www.npmjs.com/package/create-ts-node).

Tasan is a full-stack web application for splitting bills and tracking shared expenses.

The repository is a TypeScript monorepo built with pnpm workspaces. The web application uses React Router, React, and Tailwind CSS; data is stored in DynamoDB; and the production infrastructure is defined with AWS CDK.

## Project status

Tasan is under active development. Interfaces, deployment configuration, and data models may change without notice before a stable release.

## Prerequisites

- Node.js and pnpm versions specified in [`.tool-versions`](./.tool-versions)
- Docker, for running DynamoDB locally
- AWS CLI, for creating the local DynamoDB table and working with AWS infrastructure

## Getting started

Install the workspace dependencies:

```sh
pnpm install
```

Create the web application's local environment file:

```sh
cp packages/web/example.env packages/web/.env
```

Start DynamoDB Local and create the application table:

```sh
docker compose up -d dynamodb-local
./scripts/create-local-table.sh
```

Start the TypeScript workspace watcher in one terminal:

```sh
pnpm dev
```

Start the web development server in another terminal:

```sh
pnpm --filter @tasan/web dev
```

The application is available at [http://localhost:5173](http://localhost:5173).

The example environment uses the deployed Cognito user pool for authentication. Update the authentication variables in `packages/web/.env` if you need to use a different provider or client.

## Workspace packages

- [`@tasan/common`](./packages/common): shared domain utilities, validation, currency handling, graph operations, IDs, and tracing.
- [`@tasan/data`](./packages/data): DynamoDB access and persistence models.
- [`@tasan/web`](./packages/web): the full-stack React Router web application.
- [`@tasan/infra`](./packages/infra): AWS CDK stacks and runtime entry points.
- [`@tasan/export`](./packages/export): utility for exporting split data.
- [`@tasan/benchmark`](./packages/benchmark): Lambda benchmark utility.

## Common commands

Run these commands from the repository root:

- `pnpm build` — build all workspace packages.
- `pnpm dev` — watch and compile the TypeScript project references. Run the web development server separately.
- `pnpm test` — run package tests plus formatting, linting, and type checks.
- `pnpm test:format` — check formatting.
- `pnpm test:lint` — run ESLint.
- `pnpm test:types` — type-check all project references.
- `pnpm fix` — apply ESLint and Prettier fixes across the repository.
- `pnpm clean` — remove generated workspace output.

To run a command for one package, use a pnpm filter. For example:

```sh
pnpm --filter @tasan/web test
```

## Infrastructure

Infrastructure is managed from `packages/infra`. See the [infrastructure README](./packages/infra/README.md) for GitHub Actions deployment setup, AWS authentication, and CDK commands. Deployments modify live AWS resources and should only be run intentionally.

## Contributing and security

Contributions are welcome. Read [CONTRIBUTING.md](./CONTRIBUTING.md) before opening a pull request and follow the [Code of Conduct](./CODE_OF_CONDUCT.md) when participating.

Please do not report security vulnerabilities in a public issue. Follow the private reporting process in [SECURITY.md](./SECURITY.md).

## License

Copyright © 2026 Santeri Hiltunen.

Tasan is licensed under the [GNU Affero General Public License, version 3 or later](./LICENSE). If you modify Tasan and make it available to users over a network, the AGPL requires you to offer those users the corresponding source code.
