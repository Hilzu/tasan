# `@tasan/benchmark`

An operational benchmark for comparing the production application Lambda across configured architectures and memory sizes. It updates `TasanAppFn` in `eu-central-1`, sends authenticated requests to the split list (`/splits`) and a single split page (`/splits/<SPLIT_ID>`), and matches each request to the function's CloudWatch Logs platform report. Raw samples are written to stdout as TSV and a summary table to stderr.

This utility mutates the live Lambda configuration and code. It is not a local or read-only benchmark. Run it only when a production benchmark has been explicitly requested, with credentials for the production AWS account active that can read and update the function and read its log group. Architecture changes redeploy the currently deployed code package, and the original architecture and memory size are restored when the run finishes, fails, or is interrupted with a single Ctrl-C. Check the Lambda configuration manually if the process is killed before it reports the restore.

## Usage

Set `SESSION_COOKIE` to a valid authenticated cookie and `SPLIT_ID` to a split that user belongs to. A split with many expenses and participants gives the most representative heavy page. Redirect stdout to keep the raw samples:

```sh
SESSION_COOKIE='<cookie>' SPLIT_ID='spl_…' pnpm --silent start > results.tsv
```

Never commit or share the session cookie.

## Commands

- `pnpm build` — compile the utility.
- `pnpm clean` — remove generated output.
