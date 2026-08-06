# `@tasan/infra`

AWS CDK infrastructure for Tasan. It defines the DynamoDB global table, Cognito authentication, Lambda runtimes, CloudFront distribution, S3 assets, DNS, and regional application resources.

The CDK app currently targets the AWS account and regions configured in `src/cdk-app.ts`. Review synthesized changes carefully before applying them.

## AWS authentication

The project deployment workflow uses the `SCOy-TasanApp` AWS profile:

```sh
export AWS_PROFILE=SCOy-TasanApp
aws sso login
```

## Commands

- `pnpm build` — compile the CDK and runtime sources.
- `pnpm cdk:synth` — synthesize the CloudFormation templates.
- `pnpm cdk:diff` — compare the local definition with deployed stacks.
- `pnpm clean` — remove `dist/` and `cdk.out/`.
- `pnpm deploy` — build, synchronize web assets, and deploy all stacks.

`deploy` changes live AWS resources and uploads production assets. Run it only when an intentional deployment has been requested and the diff has been reviewed.

Generated output is written to `dist/` and `cdk.out/`; edit files in `src/` and `assets/` instead.
