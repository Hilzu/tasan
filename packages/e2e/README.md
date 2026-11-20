# End-to-end tests

Run from the repository root with Node.js and pnpm from `.tool-versions`, plus
Docker:

```sh
pnpm install
pnpm --filter @tasan/e2e exec playwright install chromium
docker compose -f packages/e2e/compose.yml up --detach
pnpm --filter @tasan/e2e test:e2e
docker compose -f packages/e2e/compose.yml down
```

By default, Playwright builds and serves the production application at
`http://127.0.0.1:4173`. It creates a unique table in the in-memory DynamoDB Local
instance on port 8001 and removes that table on graceful shutdown. Compose
`down` also discards all test data after an interrupted run. The development
database is not used. `E2E_DYNAMODB_ENDPOINT` can select another loopback HTTP
endpoint.

The local server explicitly supplies disposable credentials and secrets, seeds
three fictional users, and uses the existing `AUTH_DISABLE` session-creation
form. It does not create Cognito users, use AWS credentials, or change the
production authentication configuration. Only the external USD-to-EUR
exchange-rate response is stubbed locally; application calculations, sessions,
loaders, actions, and database writes are real.

The suite covers split creation, invitations and single-use acceptance,
membership protection, expense creation/editing/history/deletion, equal and
weighted allocations, adjustments, calculations, foreign currency conversion,
repayments, settings validation/persistence, and local session logout.

CI runs the suite on changes and the deployment workflow runs it before AWS
authentication or deployment. `pnpm test` remains the unit/lint/type-check
command. Browser failures retain screenshots, traces, and an HTML report; local
CI failure artifacts are retained for seven days.

## Deployed environments

Read-only public checks do not need credentials:

```sh
E2E_BASE_URL=https://your-test-deployment.example pnpm --filter @tasan/e2e test:e2e --project=public
```

For the full suite, use three **dedicated, distinct test accounts** with
English/UK or browser-default formatting. Capture each account's signed-in
state in a separate browser session. From `packages/e2e`:

```sh
mkdir -p playwright/.auth
pnpm exec playwright codegen --save-storage=playwright/.auth/owner.json https://your-test-deployment.example/login
pnpm exec playwright codegen --save-storage=playwright/.auth/member.json https://your-test-deployment.example/login
pnpm exec playwright codegen --save-storage=playwright/.auth/outsider.json https://your-test-deployment.example/login
```

Sign in to the corresponding account, reach the application, then close each
browser. Run from the repository root:

```sh
E2E_BASE_URL=https://your-test-deployment.example \
E2E_ALLOW_MUTATIONS=1 \
E2E_OWNER_STORAGE_STATE=playwright/.auth/owner.json \
E2E_MEMBER_STORAGE_STATE=playwright/.auth/member.json \
E2E_OUTSIDER_STORAGE_STATE=playwright/.auth/outsider.json \
pnpm --filter @tasan/e2e test:e2e
```

Providing `E2E_BASE_URL` disables all local provisioning. The app keeps its
normal authentication; deployed tests use the saved sessions, not the bypass.
The local logout test is skipped so it cannot revoke those saved sessions.
Cognito's interactive sign-in itself is not automated. Refresh saved states
when sessions expire.

The suite creates uniquely named splits and financial records. Successful
tests delete their expenses/payments and restore account settings, but splits
and deleted-record history remain, and failed runs can leave records. Do not
target real accounts or real financial data.

State files contain credentials. They, traces, screenshots, and reports are
ignored by Git; keep them private and do not publish artifacts from real
accounts.

## Agent browser tooling

`playwright-cli` is installed in this package. The package's CLI configuration
uses Playwright's Chromium rather than requiring a separate Chrome installation:

```sh
pnpm --filter @tasan/e2e exec playwright-cli install-browser chromium
pnpm --filter @tasan/e2e exec playwright-cli --help
pnpm --filter @tasan/e2e exec playwright-cli open http://127.0.0.1:4173
```

To keep the isolated app running for exploration while DynamoDB Local is up,
use `pnpm --filter @tasan/e2e exec node scripts/local-server.ts`. Stop it when
finished to remove its table.
