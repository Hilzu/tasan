# `@tasan/data`

The persistence layer for Tasan. This package provides DynamoDB-backed models for users, splits, expenses, invitations, and sessions.

## Usage

Import the package through its workspace name:

```ts
import type { Split, SplitExpense } from "@tasan/data";
```

The package requires `TABLE_NAME` to contain the DynamoDB table name. AWS credentials, region, and an optional endpoint are read by the AWS SDK from the environment. See [`../web/example.env`](../web/example.env) for the local development configuration.

Local setup is documented in the [root README](../../README.md).

## Commands

- `pnpm build` — compile the package.
- `pnpm test` — run TypeScript persistence adapter tests without AWS credentials or network access.
- `pnpm clean` — remove generated output.

Generated files are written to `dist/`; edit files in `src/` instead.
