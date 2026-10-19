# `@tasan/data`

The persistence layer for Tasan. This package provides DynamoDB-backed models for users, splits, expenses, invitations, and sessions.

## Usage

Import the package through its workspace name:

```ts
import type { Split, SplitExpense } from "@tasan/data";
```

The package requires `TABLE_NAME` to contain the DynamoDB table name. AWS credentials, region, and an optional endpoint are read by the AWS SDK from the environment. See [`../web/example.env`](../web/example.env) for the local development configuration.

Local setup is documented in the [root README](../../README.md).

Batch reads use at most 100 keys per request and retry unprocessed keys up to five
times with exponential backoff and jitter. Exhausted retries fail the operation
instead of returning incomplete data; records that do not exist remain omitted.

Cognito identity mappings use a fixed key and conditional creation so concurrent
first logins resolve to the same user. Existing mappings remain readable without
a migration. For multi-region deployments, set `COGNITO_MAPPING_REGION` to the
same table region in every application replica: conditional writes only arbitrate
within a region. CDK configures Frankfurt as this authority; other persistence
operations continue using their local replica. Local development can leave this
variable unset to use the default client and endpoint.

New mappings atomically include a legacy-format pointer so older application
versions can still resolve these users during deployments or rollbacks.

## Commands

- `pnpm build` — compile the package.
- `pnpm test` — run TypeScript persistence adapter tests without AWS credentials or network access.
- `pnpm clean` — remove generated output.

Generated files are written to `dist/`; edit files in `src/` instead.
