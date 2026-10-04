import {
  aws_iam as iam,
  CfnCondition,
  CfnOutput,
  CfnParameter,
  Fn,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

const deploymentRegions = ["eu-central-1", "ap-southeast-1", "us-east-1"];
const bootstrapQualifier = "hnb659fds";

export class DeploymentAccessStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const assetsBucketName = new CfnParameter(this, "AssetsBucketName", {
      type: "String",
      description: "Existing TasanStack application assets bucket name",
      allowedPattern: "[a-z0-9][a-z0-9.-]{1,61}[a-z0-9]",
    });
    const distributionID = new CfnParameter(this, "CloudFrontDistributionId", {
      type: "String",
      description: "Existing TasanStack application CloudFront distribution ID",
      allowedPattern: "[A-Z0-9]+",
    });
    const oidcSubject = new CfnParameter(this, "GitHubOidcSubject", {
      type: "String",
      description: "Exact GitHub OIDC subject for Hilzu/tasan production jobs",
      default: "repo:Hilzu/tasan:environment:production",
      allowedPattern:
        "repo:Hilzu(@[0-9]+)?/tasan(@[0-9]+)?:environment:production",
    });
    const createProvider = new CfnParameter(this, "CreateGitHubOidcProvider", {
      type: "String",
      description:
        "Set false to reuse the account's existing GitHub OIDC provider",
      default: "true",
      allowedValues: ["true", "false"],
    });
    const createProviderCondition = new CfnCondition(
      this,
      "CreateGitHubProvider",
      { expression: Fn.conditionEquals(createProvider.valueAsString, "true") },
    );

    const provider = new iam.CfnOIDCProvider(this, "GitHubOidcProvider", {
      url: "https://token.actions.githubusercontent.com",
      clientIdList: ["sts.amazonaws.com"],
    });
    provider.cfnOptions.condition = createProviderCondition;
    // The account-wide provider may be used by other repositories as well.
    provider.applyRemovalPolicy(RemovalPolicy.RETAIN);

    const providerArn = Fn.conditionIf(
      createProviderCondition.logicalId,
      provider.ref,
      this.formatArn({
        service: "iam",
        region: "",
        resource: "oidc-provider",
        resourceName: "token.actions.githubusercontent.com",
      }),
    ).toString();

    const role = new iam.Role(this, "DeploymentRole", {
      roleName: "TasanGitHubDeploy",
      description:
        "GitHub Actions deployment access for Hilzu/tasan production",
      assumedBy: new iam.WebIdentityPrincipal(providerArn, {
        StringEquals: {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
          "token.actions.githubusercontent.com:sub": oidcSubject.valueAsString,
        },
      }),
    });

    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["sts:AssumeRole"],
        resources: deploymentRegions.flatMap((region) =>
          ["deploy", "file-publishing", "lookup"].map((purpose) =>
            this.formatArn({
              service: "iam",
              region: "",
              resource: "role",
              resourceName: `cdk-${bootstrapQualifier}-${purpose}-role-${this.account}-${region}`,
            }),
          ),
        ),
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter"],
        resources: deploymentRegions.map((region) =>
          this.formatArn({
            service: "ssm",
            region,
            resource: "parameter",
            resourceName: `cdk-bootstrap/${bootstrapQualifier}/version`,
          }),
        ),
      }),
    );

    const bucketArn = this.formatArn({
      service: "s3",
      region: "",
      account: "",
      resource: assetsBucketName.valueAsString,
    });
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:ListBucket"],
        resources: [bucketArn],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["s3:GetObject", "s3:PutObject"],
        resources: [`${bucketArn}/*`],
      }),
    );
    role.addToPolicy(
      new iam.PolicyStatement({
        actions: ["cloudfront:CreateInvalidation"],
        resources: [
          this.formatArn({
            service: "cloudfront",
            region: "",
            resource: "distribution",
            resourceName: distributionID.valueAsString,
          }),
        ],
      }),
    );

    new CfnOutput(this, "AWSRoleArn", { value: role.roleArn });
    new CfnOutput(this, "AssetsBucketNameOutput", {
      value: assetsBucketName.valueAsString,
    });
    new CfnOutput(this, "CloudFrontDistributionIdOutput", {
      value: distributionID.valueAsString,
    });
  }
}
