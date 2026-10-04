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

The [Deploy workflow](../../.github/workflows/deploy.yml) is started manually from **Actions → Deploy → Run workflow**, with `main` selected. It builds and tests the selected commit, authenticates with AWS through OIDC, synthesizes infrastructure, discovers the existing assets bucket and CloudFront distribution from `TasanStack`, uploads web assets, deploys all CDK stacks, and requests a CloudFront invalidation for `favicon.ico` and `robots.txt`. Only one production deployment runs at a time; an active deployment is never cancelled by a newer run.

Complete this one-time setup before running it:

1. In GitHub repository settings, create the `production` environment and restrict its deployment branches to `main`. Add required reviewers if deployment approval is desired.
2. Deploy the separate access stack using SSO as described below. It manages the GitHub deployment role and its resource permissions.
3. Add the **environment variable** `AWS_ROLE_ARN` to GitHub's `production` environment using the access stack's `AWSRoleArn` output: the ARN of `TasanGitHubDeploy` in account `412381763181`.

No GitHub variables are required for the bucket or distribution. [`scripts/resolve-deployment-resources.sh`](../../scripts/resolve-deployment-resources.sh) uses CloudFormation's paginated resource list in `eu-central-1` and selects the application resources by type and CDK logical ID prefix. It works with the existing stack without adding outputs first, ignores deleted resources, and fails before uploading if a resource is missing, ambiguous, or has an invalid ID. See the [AWS CLI reference](https://docs.aws.amazon.com/cli/latest/reference/cloudformation/list-stack-resources.html).

The workflow targets the existing production installation. Provisioning a new installation also requires updating the account, domain, certificate, and runtime configuration in the CDK sources. No local AWS profile, interactive SSO login, or long-lived AWS keys are used by the workflow.

The workflow deploys the synthesized assembly with `--require-approval never`, so review infrastructure changes before running it. Environment reviewers, when configured, approve the job before it starts. Hashed assets are uploaded before the server is updated and older files are retained for cached pages and application rollbacks. Remove obsolete assets separately only after they are no longer needed. Root files may update even if a later CDK deployment fails; the deployment is not atomic across S3 and the regional stacks. An invalidation request can take time to propagate after the workflow finishes.

## Deployment role management

[`src/access-app.ts`](./src/access-app.ts) is a separate CDK entry point containing only `TasanDeploymentAccessStack`. It creates the `TasanGitHubDeploy` IAM role, its trust policy, and its permissions. The normal application entry point does not include this stack, so local application deployments and the GitHub workflow's `cdk deploy --all` do not deploy it. Manage initial setup and subsequent role changes through the access commands using your SSO profile.

Before initial setup, ensure the default CDK bootstrap stack (`hnb659fds`) exists in account `412381763181` in `eu-central-1`, `ap-southeast-1`, and `us-east-1` (Lambda@Edge). The bootstrap roles must trust same-account principals, and their CloudFormation execution roles must have permissions to deploy the application resources and, in `eu-central-1`, the access stack's IAM resources. If these bootstrap resources already support local deployments, they can normally be reused. See [CDK bootstrap setup](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html). Customized bootstrap qualifiers require updating the access stack and application synthesizer configuration together.

From the repository root, authenticate, build, synthesize, and review the access stack:

```sh
export AWS_PROFILE=SCOy-TasanApp
aws sso login
pnpm build
pnpm --filter @tasan/infra access:synth
pnpm --filter @tasan/infra access:diff
```

You can read the current production resource IDs using the same discovery script as the workflow:

```sh
bash scripts/resolve-deployment-resources.sh
```

Then intentionally deploy the access stack with those resource IDs. Replace `YOUR_BUCKET_NAME` and `YOUR_DISTRIBUTION_ID` with the discovered values:

```sh
pnpm --filter @tasan/infra access:deploy \
  --parameters AssetsBucketName=YOUR_BUCKET_NAME \
  --parameters CloudFrontDistributionId=YOUR_DISTRIBUTION_ID
```

The stack creates GitHub's account-wide OIDC provider by default. If `token.actions.githubusercontent.com` already exists in IAM, append `--parameters CreateGitHubOidcProvider=false` on the first deployment to reuse it, and ensure it includes audience `sts.amazonaws.com`. A provider created by this stack is retained if the stack is deleted because other repositories may share it. Keep the provider ownership choice consistent on subsequent updates.

The role requires audience `sts.amazonaws.com` and an exact subject matching `repo:Hilzu/tasan:environment:production`. If the repository uses GitHub's immutable subject format, also supply `--parameters GitHubOidcSubject=repo:Hilzu@OWNER_ID/tasan@REPOSITORY_ID:environment:production`, replacing both IDs. The parameter accepts the legacy and immutable formats for this repository's `production` environment. See [GitHub's AWS OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

The role can assume only the default bootstrap deployment, file-publishing, and lookup roles in the three application regions, and read their bootstrap version parameters. CloudFormation read access is limited to listing resources in `TasanStack`. Direct S3 permissions allow listing the configured assets bucket and reading/writing its objects; CloudFront permission allows invalidation on the configured distribution. `AssetsBucketName` and `CloudFrontDistributionId` remain access-stack parameters to scope these permissions; they are not GitHub variables. Update these parameters through SSO if the application resources are replaced. The bootstrap deployment roles pass their existing CloudFormation execution roles during deployment; the GitHub role does not receive direct IAM administration permissions. Effective deployment privileges still depend on those execution roles.

For later role changes, edit `src/deployment-access-stack.ts`, build, review with `access:diff`, and deploy with `access:deploy` using SSO. CDK reuses previously supplied parameters on updates unless you override them. The access stack has termination protection enabled. Its generated assembly is kept in `cdk.out/access/` and contains no application stacks or assets.

## Commands

- `pnpm build` — compile the CDK and runtime sources.
- `pnpm cdk:synth` — synthesize the CloudFormation templates.
- `pnpm cdk:diff` — compare the local definition with deployed stacks.
- `pnpm access:synth` — synthesize the separate deployment access stack.
- `pnpm access:diff` — compare the access stack using templates without creating a change set.
- `pnpm access:deploy` — deploy the access stack intentionally using SSO credentials.
- `pnpm test` — compile the infrastructure sources and verify deployment trust, permission scopes, and resource discovery.
- `pnpm clean` — remove `dist/` and `cdk.out/`.
- `pnpm deploy` — build, synchronize web assets, and deploy all stacks.

`deploy` changes live AWS resources and uploads production assets. Run it only when an intentional deployment has been requested and the diff has been reviewed.

Generated output is written to `dist/` and `cdk.out/`; edit files in `src/` and `assets/` instead.
