# `@tasan/benchmark`

An operational benchmark for comparing the production application Lambda across configured architectures and memory sizes. It updates `TasanAppFn` in `eu-central-1`, sends authenticated requests to `https://tasan.app/splits`, and prints latency measurements.

This utility mutates the live Lambda configuration and code. It is not a local or read-only benchmark. Run it only when a production benchmark has been explicitly requested, with credentials for the production AWS account active. Architecture changes redeploy the currently deployed code package, and the original architecture and memory size are restored when the run finishes, fails, or is interrupted with a single Ctrl-C. Check the Lambda configuration manually if the process is killed before it reports the restore.

## Usage

Set `SESSION_COOKIE` to a valid authenticated cookie:

```sh
SESSION_COOKIE='<cookie>' pnpm start
```

Never commit or share the session cookie.

## Commands

- `pnpm build` — compile the utility.
- `pnpm clean` — remove generated output.
