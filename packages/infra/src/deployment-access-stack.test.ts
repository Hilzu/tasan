import { test } from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { DeploymentAccessStack } from "./deployment-access-stack.js";

const synthesize = (): Template =>
  Template.fromStack(
    new DeploymentAccessStack(
      new App({
        context: {
          "@aws-cdk/core:enablePartitionLiterals": true,
          "@aws-cdk/aws-iam:minimizePolicies": true,
        },
      }),
      "Access",
      { env: { account: "412381763181", region: "eu-central-1" } },
    ),
  );

await test("deployment role trusts only the configured production OIDC subject and audience", () => {
  const template = synthesize();
  template.resourceCountIs("AWS::IAM::Role", 1);
  template.hasParameter("GitHubOidcSubject", {
    Default: "repo:Hilzu/tasan:environment:production",
    AllowedPattern:
      "repo:Hilzu(@[0-9]+)?/tasan(@[0-9]+)?:environment:production",
  });
  template.hasResourceProperties("AWS::IAM::Role", {
    RoleName: "TasanGitHubDeploy",
    ManagedPolicyArns: Match.absent(),
    Policies: Match.absent(),
    AssumeRolePolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Action: "sts:AssumeRoleWithWebIdentity",
          Effect: "Allow",
          Principal: {
            Federated: {
              "Fn::If": [
                "CreateGitHubProvider",
                { Ref: "GitHubOidcProvider" },
                "arn:aws:iam::412381763181:oidc-provider/token.actions.githubusercontent.com",
              ],
            },
          },
          Condition: {
            StringEquals: {
              "token.actions.githubusercontent.com:aud": "sts.amazonaws.com",
              "token.actions.githubusercontent.com:sub": {
                Ref: "GitHubOidcSubject",
              },
            },
          },
        },
      ],
    },
  });
  template.hasOutput("AWSRoleArn", {
    Value: { "Fn::GetAtt": [Match.anyValue(), "Arn"] },
  });
});

await test("permissions are limited to regional bootstrap roles and the configured app resources", () => {
  const template = synthesize();
  template.resourceCountIs("AWS::IAM::Policy", 1);
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: {
      Version: "2012-10-17",
      Statement: [
        {
          Effect: "Allow",
          Action: "sts:AssumeRole",
          Resource: [
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-deploy-role-412381763181-ap-southeast-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-deploy-role-412381763181-eu-central-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-deploy-role-412381763181-us-east-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-file-publishing-role-412381763181-ap-southeast-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-file-publishing-role-412381763181-eu-central-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-file-publishing-role-412381763181-us-east-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-lookup-role-412381763181-ap-southeast-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-lookup-role-412381763181-eu-central-1",
            "arn:aws:iam::412381763181:role/cdk-hnb659fds-lookup-role-412381763181-us-east-1",
          ],
        },
        {
          Effect: "Allow",
          Action: "ssm:GetParameter",
          Resource: [
            "arn:aws:ssm:ap-southeast-1:412381763181:parameter/cdk-bootstrap/hnb659fds/version",
            "arn:aws:ssm:eu-central-1:412381763181:parameter/cdk-bootstrap/hnb659fds/version",
            "arn:aws:ssm:us-east-1:412381763181:parameter/cdk-bootstrap/hnb659fds/version",
          ],
        },
        {
          Effect: "Allow",
          Action: "cloudformation:ListStackResources",
          Resource:
            "arn:aws:cloudformation:eu-central-1:412381763181:stack/TasanStack/*",
        },
        {
          Effect: "Allow",
          Action: "s3:ListBucket",
          Resource: {
            "Fn::Join": ["", ["arn:aws:s3:::", { Ref: "AssetsBucketName" }]],
          },
        },
        {
          Effect: "Allow",
          Action: ["s3:GetObject", "s3:PutObject"],
          Resource: {
            "Fn::Join": [
              "",
              ["arn:aws:s3:::", { Ref: "AssetsBucketName" }, "/*"],
            ],
          },
        },
        {
          Effect: "Allow",
          Action: "cloudfront:CreateInvalidation",
          Resource: {
            "Fn::Join": [
              "",
              [
                "arn:aws:cloudfront::412381763181:distribution/",
                { Ref: "CloudFrontDistributionId" },
              ],
            ],
          },
        },
      ],
    },
  });
});

await test("the account-wide OIDC provider can be reused and is retained when managed here", () => {
  const template = synthesize();
  template.hasParameter("CreateGitHubOidcProvider", {
    Default: "true",
    AllowedValues: ["true", "false"],
  });
  template.hasCondition("CreateGitHubProvider", {
    "Fn::Equals": [{ Ref: "CreateGitHubOidcProvider" }, "true"],
  });
  template.templateMatches(
    Match.objectLike({
      Resources: {
        GitHubOidcProvider: {
          Type: "AWS::IAM::OIDCProvider",
          Condition: "CreateGitHubProvider",
          DeletionPolicy: "Retain",
          UpdateReplacePolicy: "Retain",
          Properties: {
            Url: "https://token.actions.githubusercontent.com",
            ClientIdList: ["sts.amazonaws.com"],
          },
        },
      },
    }),
  );
  template.resourceCountIs("AWS::Lambda::Function", 0);
  template.resourceCountIs("AWS::S3::Bucket", 0);
  template.resourceCountIs("AWS::CloudFront::Distribution", 0);
});
