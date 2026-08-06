# `@tasan/benchmark`

An operational benchmark for comparing the production application Lambda across configured architectures and memory sizes. It updates `TasanAppFn`, sends authenticated requests to `https://tasan.app/splits`, and prints latency measurements.

This utility mutates the live Lambda configuration and code. It is not a local or read-only benchmark. Run it only when a production benchmark has been explicitly requested, with the correct AWS account and region active, and be prepared to restore the intended Lambda configuration afterward.

## Usage

Set `SESSION_COOKIE` to a valid authenticated cookie:

```sh
SESSION_COOKIE='<cookie>' pnpm start
```

Never commit or share the session cookie.

## Commands

- `pnpm build` — compile the utility.
- `pnpm clean` — remove generated output.
