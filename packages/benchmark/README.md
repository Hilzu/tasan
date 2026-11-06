# `@tasan/benchmark`

An operational benchmark for comparing the production application Lambda across configured architectures and memory sizes. It updates `TasanAppFn` in `eu-central-1`, sends authenticated requests to the split list (`/splits`) and a single split page (`/splits/<SPLIT_ID>`), and matches each request to the function's CloudWatch Logs platform report. A summary table is printed and the raw samples are written as TSV to `packages/benchmark/out/`.

This utility mutates the live Lambda configuration and code. It is not a local or read-only benchmark. Run it only when a production benchmark has been explicitly requested, with credentials for the production AWS account active that can read and update the function and read its log group. Architecture changes redeploy the currently deployed code package, and the original architecture and memory size are restored when the run finishes, fails, or is interrupted with a single Ctrl-C, and the samples collected so far are still printed. Check the Lambda configuration manually if the process is killed before it reports the restore or exits with an error saying the restore failed. After the restore, Ctrl-C stops waiting for log reports and prints the results with the reports found so far.

## Usage

Set `SESSION_COOKIE` to a valid authenticated cookie and `SPLIT_ID` to a split that user belongs to. A split with many expenses and participants gives the most representative heavy page:

```sh
SESSION_COOKIE='<cookie>' SPLIT_ID='spl_…' pnpm start
```

Never commit or share the session cookie. The `out/` folder is gitignored.

## Commands

- `pnpm build` — compile the utility.
- `pnpm clean` — remove generated output.
