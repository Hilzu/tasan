# tasan

This project was bootstrapped with [create-ts-node](https://www.npmjs.com/package/create-ts-node).

Split bills easily with this web app.

## Packages

- [data](./packages/data/README.md): The data layer of the app.
- [infra](./packages/infra/README.md): The CDK app that deploys the infrastructure to AWS.
- [web](./packages/web/README.md): The main web app made with React router.

## Workspace scripts

- `pnpm build` compile typescript to js
- `pnpm dev` watch for changes and compile typescript to js. web needs to be run separately.
- `pnpm test` run test for all packages with workspace level checks
