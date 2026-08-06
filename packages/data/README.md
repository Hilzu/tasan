# `@tasan/data`

The persistence layer for Tasan. This package provides DynamoDB-backed models for users, splits, expenses, invitations, and sessions.

## Usage

Import the package through its workspace name:

```ts
import type { Split, SplitExpense } from "@tasan/data";
```

The package requires `TABLE_NAME` to contain the DynamoDB table name. AWS credentials, region, and an optional endpoint are read by the AWS SDK from the environment. See [`../web/example.env`](../web/example.env) for the local development configuration.

The table uses `pk` and `sk` as its primary key and `GSI-SK-PK` as a reversed-key global secondary index. Local setup is documented in the [root README](../../README.md).

## Commands

- `pnpm build` — compile the package.
- `pnpm clean` — remove generated output.

Generated files are written to `dist/`; edit files in `src/` instead.
