# `@tasan/export`

A maintenance utility that exports every DynamoDB item belonging to a split into a timestamped JSON file.

The utility reads the default AWS SDK configuration and queries `TABLE_NAME` (default: `TasanAppTable`). Ensure the intended AWS profile and region are active before running it.

## Usage

```sh
mkdir -p out
pnpm start -- --split-id <split-id>
```

Output is written under `packages/export/out/`. The exported JSON is an opaque backup managed by `@tasan/data` that includes all revisions and deletions and may contain sensitive user data; handle it accordingly and do not commit it.

## Commands

- `pnpm build` — compile the utility.
- `pnpm clean` — remove generated output.
