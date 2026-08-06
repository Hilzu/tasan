# `@tasan/common`

Shared, platform-independent domain utilities for Tasan. The package contains comparison helpers, currency and decimal operations, currency conversion, expense graph logic, branded IDs, tracing, and validation schemas.

Import individual modules through the package exports:

```ts
import { create } from "@tasan/common/decimal";
import { asSplitID } from "@tasan/common/id";
```

## Commands

- `pnpm build` — compile the package.
- `pnpm clean` — remove generated output.

Public modules must be listed in the `exports` map in `package.json`. Generated files are written to `dist/`; edit files in `src/` instead.
