# AGENTS.md

This file applies to the entire repository.

## Project overview

Tasan is a pnpm workspace for a bill-splitting web application. It uses Node.js 24, TypeScript with ESM and strict type checking, React 19, React Router 8, Tailwind CSS 4, DynamoDB, and AWS CDK.

Workspace packages:

- `packages/common`: shared domain utilities, validation, currency, graph, ID, and tracing code.
- `packages/data`: DynamoDB clients and persistence models.
- `packages/web`: the full-stack React Router application and the repository's current tests.
- `packages/infra`: AWS CDK stacks and Lambda/CloudFront entry points.
- `packages/export`: split export CLI/job.
- `packages/benchmark`: Lambda benchmark utility.

## Tooling and commands

- Use `pnpm`; do not introduce npm or Yarn lockfiles.
- Use the Node.js and pnpm versions specified in `.tool-versions`.
- Install dependencies with `pnpm install` from the repository root.
- Run all checks with `pnpm test`. This runs package tests, formatting checks, ESLint, and TypeScript checks.
- Build all packages with `pnpm build`.
- Start the web development server with `pnpm --filter @tasan/web dev`.
- Run a single web test file with `pnpm --filter @tasan/web exec tsx --test path/to/file.test.ts`.
- Format and auto-fix the repository with `pnpm fix`; note that this can touch files outside the immediate change.

Prefer the narrowest relevant check while iterating, then run `pnpm test` before handing off when practical.

## Code conventions

- Keep TypeScript strict and ESM-native. Use `import`/`export` and Node built-ins with the `node:` prefix.
- Use `import type` for type-only imports. Keep imports and exports sorted according to the ESLint configuration.
- Follow the existing Prettier configuration, including the Tailwind class sorter. Do not hand-format around it.
- Preserve package boundaries. Put broadly reusable domain logic in `common`, persistence concerns in `data`, UI and request handling in `web`, and deployment concerns in `infra`.
- Use workspace package imports such as `@tasan/common/...` and `@tasan/data` instead of reaching into another package's source tree.
- Follow nearby naming and file-layout patterns. React Router routes are registered in `packages/web/app/routes.ts`; reusable UI belongs in `packages/web/app/components`.
- Add or update focused `*.test.ts` files for behavior changes where feasible. Tests use Node's built-in test runner through `tsx --test`.

## Generated files and infrastructure

- Do not edit generated output in `dist/`, `build/`, `.react-router/`, or `cdk.out/`. Change source files and regenerate output instead.
- Do not commit dependencies under `node_modules/`.
- Treat AWS operations as externally mutating. `cdk:diff` and `cdk:synth` are suitable for validation; do not run `deploy`, create cloud resources, or change live data unless explicitly requested.
- Do not assume AWS credentials or production environment variables are available. The web environment template is `packages/web/example.env`.

## Change discipline

- Keep changes scoped to the request and preserve unrelated working-tree modifications.
- Do not add dependencies unless the existing platform cannot reasonably support the change. If one is needed, add it to the package that uses it with the appropriate `pnpm` command.
- Never edit `pnpm-lock.yaml` manually. It may only be updated by `pnpm` commands.
- Update documentation when commands, package responsibilities, configuration, or user-visible behavior change.
- In the handoff, summarize changed files and report the exact validation commands run, including any failures or checks that could not be run.
