# `@tasan/data`

The persistence layer for Tasan. This package provides DynamoDB-backed models for users, splits, expenses, invitations, and sessions.

## Usage

Import the package through its workspace name:

```ts
import type { Split, SplitExpense } from "@tasan/data";
```

The package requires `TABLE_NAME` to contain the DynamoDB table name. AWS credentials, region, and an optional endpoint are read by the AWS SDK from the environment. See [`../web/example.env`](../web/example.env) for the local development configuration.

The table uses `pk` and `sk` as its primary key and `GSI-SK-PK` as a reversed-key global secondary index. Local setup is documented in the [root README](../../README.md).

`getSplit` reads split metadata without loading expenses or memberships; `getSplitWithData` reads the aggregate. `createSplit` writes the split and its owner membership in one transaction. `consumeInviteForSplit` conditionally consumes an unexpired invitation and adds membership in one transaction, returning `false` if the invitation has already been consumed or expired. An existing member's creation metadata is preserved. Invitations expose `expiresAt` so the application layer can also reject expired previews before DynamoDB TTL cleanup.

## Commands

- `pnpm build` — compile the package.
- `pnpm test` — compile and run persistence adapter tests without AWS credentials or network access.
- `pnpm clean` — remove generated output.

Generated files are written to `dist/`; edit files in `src/` instead.
