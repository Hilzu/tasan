# `@tasan/data`

The persistence layer for Tasan. This package provides DynamoDB-backed models for users, splits, expenses, invitations, and sessions.

## Usage

Import the package through its workspace name:

```ts
import type { Split, SplitExpense } from "@tasan/data";
```

The package requires `TABLE_NAME` to contain the DynamoDB table name. AWS credentials, region, and an optional endpoint are read by the AWS SDK from the environment. See [`../web/example.env`](../web/example.env) for the local development configuration.

Local setup is documented in the [root README](../../README.md).

Cognito identity mappings use a fixed key and conditional creation so concurrent
first logins resolve to the same user. Legacy mappings are upgraded automatically
when resolved, preserving their user IDs and creation timestamps. Migration
atomically creates the new mapping and removes the old one. New users receive
only the new mapping format.

For multi-region deployments, set `COGNITO_MAPPING_REGION` to the same table
region in every application replica: conditional writes only arbitrate within a
region. CDK configures Frankfurt as this authority; other persistence operations
continue using their local replica. Local development can leave this variable
unset to use the default client and endpoint.

## Commands

- `pnpm build` — compile the package.
- `pnpm test` — run TypeScript persistence adapter tests without AWS credentials or network access.
- `pnpm clean` — remove generated output.

Generated files are written to `dist/`; edit files in `src/` instead.
