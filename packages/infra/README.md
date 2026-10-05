# `@tasan/infra`

AWS CDK infrastructure for Tasan. It defines the DynamoDB global table, Cognito authentication, Lambda runtimes, CloudFront distribution, S3 assets, DNS, and regional application resources.

The CDK app currently targets the AWS account and regions configured in `src/cdk-app.ts`. Review synthesized changes carefully before applying them.

## AWS authentication

Local deployments use the `SCOy-TasanApp` AWS profile:

```sh
export AWS_PROFILE=SCOy-TasanApp
aws sso login
```

## GitHub Actions deployment

Run the [Deploy workflow](../../.github/workflows/deploy.yml) from **Actions → Deploy → Run workflow** on `main`. It builds, tests, and deploys the existing production installation. Review infrastructure changes before running it.

For initial setup, ensure account `412381763181` has the default [CDK bootstrap resources](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html) in `eu-central-1`, `ap-southeast-1`, and `us-east-1`. Using the SSO profile above, run these commands from the repository root:

```sh
pnpm build
pnpm --filter @tasan/infra access:diff
bash scripts/resolve-deployment-resources.sh
```

Deploy the access stack, replacing the placeholders with the bucket and distribution IDs printed by the discovery script:

```sh
pnpm --filter @tasan/infra access:deploy \
  --parameters AssetsBucketName=YOUR_BUCKET_NAME \
  --parameters CloudFrontDistributionId=YOUR_DISTRIBUTION_ID
```

If GitHub's OIDC provider already exists in IAM, add `--parameters CreateGitHubOidcProvider=false`; its audience must include `sts.amazonaws.com`. If the repository uses immutable OIDC subjects, set `GitHubOidcSubject` to its exact production subject; see [GitHub's OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

In GitHub settings, create the `production` environment, restrict it to `main`, and set its `AWS_ROLE_ARN` variable to the access stack's `AWSRoleArn` output. Add required reviewers if desired. The workflow discovers the bucket and distribution automatically.

Manage later role changes through `access:diff` and `access:deploy` using SSO; the app workflow does not deploy the access stack. Update its resource parameters if the bucket or distribution is replaced.

## Commands

- `pnpm build` — compile the CDK and runtime sources.
- `pnpm cdk:synth` — synthesize the CloudFormation templates.
- `pnpm cdk:diff` — compare the local definition with deployed stacks.
- `pnpm access:synth` — synthesize the separate deployment access stack.
- `pnpm access:diff` — compare the access stack with AWS.
- `pnpm access:deploy` — deploy the access stack intentionally using SSO credentials.
- `pnpm test` — compile and test deployment configuration.
- `pnpm clean` — remove `dist/` and `cdk.out/`.
- `pnpm deploy` — build, synchronize web assets, and deploy all stacks.

`deploy` changes live AWS resources and uploads production assets. Run it only when an intentional deployment has been requested and the diff has been reviewed.

Generated output is written to `dist/` and `cdk.out/`; edit files in `src/` and `assets/` instead.
