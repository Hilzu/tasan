# Contributing to Tasan

Thanks for helping improve Tasan.

By submitting a contribution, you agree that it may be distributed under the [GNU Affero General Public License, version 3 or later](./LICENSE).

## Before you start

- Search existing issues and pull requests before opening a duplicate.
- For a substantial feature or architectural change, open a discussion or issue before investing in an implementation.
- Never include credentials, personal data, production data, or other secrets in an issue, commit, fixture, or screenshot.
- Follow the [Code of Conduct](./CODE_OF_CONDUCT.md).

## Development setup

Use the Node.js and pnpm versions in [`.tool-versions`](./.tool-versions). Install dependencies from the repository root:

```sh
pnpm install --frozen-lockfile
```

For the complete local application setup, including DynamoDB Local and environment configuration, follow the [README](./README.md#getting-started).

## Making a change

1. Create a focused branch from the current default branch.
2. Keep changes scoped and follow the conventions in nearby code and package documentation.
3. Add or update focused tests for behavior changes where practical.
4. Run the narrowest relevant checks while iterating.
5. Before submitting, run:

   ```sh
   pnpm test
   pnpm build
   ```

Do not edit generated files in `dist/`, `build/`, `.react-router/`, or `cdk.out/`. Do not commit dependencies, local environment files, or credentials. AWS deployments and changes to live data are outside the normal contribution workflow.

## Pull requests

In the pull request description:

- explain the problem and the chosen approach;
- link any related issue;
- describe how the change was tested;
- include screenshots for visible UI changes; and
- call out migrations, configuration changes, compatibility concerns, or follow-up work.

Maintainers may ask for a change to be split into smaller pull requests. A contribution can be declined when it does not fit the project's direction or maintenance capacity.
