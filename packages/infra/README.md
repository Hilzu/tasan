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
2. In AWS account `412381763181`, configure GitHub's OIDC provider with URL `https://token.actions.githubusercontent.com` and audience `sts.amazonaws.com`. Create a deployment IAM role with `sts:AssumeRoleWithWebIdentity` trust restricted to this repository's `production` environment. See [GitHub's AWS OIDC guide](https://docs.github.com/en/actions/how-tos/secure-your-work/security-harden-deployments/oidc-in-aws). For this existing repository's default subject format, the trust conditions are:

   ```json
   {
     "StringEquals": {
       "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
       "token.actions.githubusercontent.com:sub": "repo:Hilzu/tasan:environment:production"
     }
   }
   ```

   If the repository has opted into GitHub's newer immutable subject format or uses a custom subject, use its actual subject claim instead.

3. Ensure CDK is bootstrapped in `eu-central-1`, `ap-southeast-1`, and `us-east-1` (Lambda@Edge). Give the deployment role permission to assume this account's CDK bootstrap deployment, lookup, and asset-publishing roles, and to read the bootstrap version parameter. The bootstrap CloudFormation execution roles need permissions for the resources defined by these stacks. See [CDK bootstrap setup](https://docs.aws.amazon.com/cdk/v2/guide/bootstrapping-env.html).
4. Give the deployment role `s3:ListBucket` on the application assets bucket, `s3:GetObject` and `s3:PutObject` on its objects, and `cloudfront:CreateInvalidation` on the application distribution. Scope these permissions to the resources configured below.
5. Add these **environment variables** to GitHub's `production` environment:

   | Variable                     | Value                                                                                                             |
   | ---------------------------- | ----------------------------------------------------------------------------------------------------------------- |
   | `AWS_ROLE_ARN`               | ARN of the OIDC deployment role in account `412381763181`.                                                        |
   | `ASSETS_BUCKET_NAME`         | The existing `TasanStack` application assets bucket; currently `tasanstack-appassetsbucket64b3098e-jilfxtz5osd3`. |
   | `CLOUDFRONT_DISTRIBUTION_ID` | The existing `TasanStack` application CloudFront distribution ID.                                                 |

The workflow targets the existing production installation. Provisioning a new installation also requires updating the account, domain, certificate, and runtime configuration in the CDK sources. No local AWS profile, interactive SSO login, or long-lived AWS keys are used by the workflow.

The workflow deploys the synthesized assembly with `--require-approval never`, so review infrastructure changes before running it. Environment reviewers, when configured, approve the job before it starts. Hashed assets are uploaded before the server is updated and older files are retained for cached pages and application rollbacks. Remove obsolete assets separately only after they are no longer needed. Root files may update even if a later CDK deployment fails; the deployment is not atomic across S3 and the regional stacks. An invalidation request can take time to propagate after the workflow finishes.

## Commands

- `pnpm build` — compile the CDK and runtime sources.
- `pnpm cdk:synth` — synthesize the CloudFormation templates.
- `pnpm cdk:diff` — compare the local definition with deployed stacks.
- `pnpm clean` — remove `dist/` and `cdk.out/`.
- `pnpm deploy` — build, synchronize web assets, and deploy all stacks.

`deploy` changes live AWS resources and uploads production assets. Run it only when an intentional deployment has been requested and the diff has been reviewed.

Generated output is written to `dist/` and `cdk.out/`; edit files in `src/` and `assets/` instead.
