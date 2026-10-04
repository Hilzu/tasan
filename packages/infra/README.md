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

The [Deploy workflow](../../.github/workflows/deploy.yml) is started manually from **Actions → Deploy → Run workflow**, with `main` selected. It builds and tests the selected commit, authenticates with AWS through OIDC, synthesizes infrastructure, uploads web assets, deploys all CDK stacks, and requests a CloudFront invalidation for `favicon.ico` and `robots.txt`. Only one production deployment runs at a time; an active deployment is never cancelled by a newer run.

Complete this one-time setup before running it:

1. In GitHub repository settings, create the `production` environment and restrict its deployment branches to `main`. Add required reviewers if deployment approval is desired.
2. Deploy the separate access stack using SSO as described below. It manages the GitHub deployment role and its resource permissions.
3. Add these **environment variables** to GitHub's `production` environment using the access stack outputs:

   | Variable                     | Value                                                                          |
   | ---------------------------- | ------------------------------------------------------------------------------ |
   | `AWS_ROLE_ARN`               | `AWSRoleArn` output: ARN of `TasanGitHubDeploy` in account `412381763181`.     |
   | `ASSETS_BUCKET_NAME`         | `AssetsBucketNameOutput`: the existing `TasanStack` application assets bucket. |
   | `CLOUDFRONT_DISTRIBUTION_ID` | `CloudFrontDistributionIdOutput`: the existing application distribution ID.    |

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

Then intentionally deploy it with the existing production resources. Replace `YOUR_DISTRIBUTION_ID` with the CloudFront distribution ID from `TasanStack`:

```sh
pnpm --filter @tasan/infra access:deploy \
  --parameters AssetsBucketName=tasanstack-appassetsbucket64b3098e-jilfxtz5osd3 \
  --parameters CloudFrontDistributionId=YOUR_DISTRIBUTION_ID
```

The stack creates GitHub's account-wide OIDC provider by default. If `token.actions.githubusercontent.com` already exists in IAM, append `--parameters CreateGitHubOidcProvider=false` on the first deployment to reuse it, and ensure it includes audience `sts.amazonaws.com`. A provider created by this stack is retained if the stack is deleted because other repositories may share it. Keep the provider ownership choice consistent on subsequent updates.

The role requires audience `sts.amazonaws.com` and an exact subject matching `repo:Hilzu/tasan:environment:production`. If the repository uses GitHub's immutable subject format, also supply `--parameters GitHubOidcSubject=repo:Hilzu@OWNER_ID/tasan@REPOSITORY_ID:environment:production`, replacing both IDs. The parameter accepts the legacy and immutable formats for this repository's `production` environment. See [GitHub's AWS OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws).

The role can assume only the default bootstrap deployment, file-publishing, and lookup roles in the three application regions, and read their bootstrap version parameters. Direct S3 permissions allow listing the configured assets bucket and reading/writing its objects; CloudFront permission allows invalidation on the configured distribution. The bootstrap deployment roles pass their existing CloudFormation execution roles during deployment; the GitHub role does not receive direct IAM administration permissions. Effective deployment privileges still depend on those execution roles.

For later role changes, edit `src/deployment-access-stack.ts`, build, review with `access:diff`, and deploy with `access:deploy` using SSO. CDK reuses previously supplied parameters on updates unless you override them. The access stack has termination protection enabled. Its generated assembly is kept in `cdk.out/access/` and contains no application stacks or assets.

## Commands

- `pnpm build` — compile the CDK and runtime sources.
- `pnpm cdk:synth` — synthesize the CloudFormation templates.
- `pnpm cdk:diff` — compare the local definition with deployed stacks.
- `pnpm access:synth` — synthesize the separate deployment access stack.
- `pnpm access:diff` — compare the access stack using templates without creating a change set.
- `pnpm access:deploy` — deploy the access stack intentionally using SSO credentials.
- `pnpm test` — compile the infrastructure sources and verify deployment trust and permission scopes.
- `pnpm clean` — remove `dist/` and `cdk.out/`.
- `pnpm deploy` — build, synchronize web assets, and deploy all stacks.

`deploy` changes live AWS resources and uploads production assets. Run it only when an intentional deployment has been requested and the diff has been reviewed.

Generated output is written to `dist/` and `cdk.out/`; edit files in `src/` and `assets/` instead.
