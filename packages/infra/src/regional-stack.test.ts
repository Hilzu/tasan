import { mock, test } from "node:test";

import { App, aws_lambda as lambda } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { RegionalStack } from "./regional-stack.js";

await test("Singapore pins identity mapping to Frankfurt with permissions limited to Cognito keys", () => {
  const asset = mock.method(lambda.Code, "fromAsset", () =>
    lambda.Code.fromInline("exports.handler = async () => {};"),
  );
  try {
    const app = new App({
      context: { "@aws-cdk/core:enablePartitionLiterals": true },
    });
    const stack = new RegionalStack(app, "Singapore", {
      env: { account: "412381763181", region: "ap-southeast-1" },
      tableName: "TasanAppTable",
      cognitoMappingRegion: "eu-central-1",
      userPoolServerURL: "https://example.com",
      appClientID: "test-client",
      appFunctionAssetPath: "unused-test-asset",
      distributionID: "E1234567890",
    });
    const template = Template.fromStack(stack);
    template.hasResourceProperties("AWS::Lambda::Function", {
      Environment: {
        Variables: Match.objectLike({
          TABLE_NAME: "TasanAppTable",
          COGNITO_MAPPING_REGION: "eu-central-1",
        }),
      },
    });
    template.hasResourceProperties("AWS::IAM::Policy", {
      PolicyDocument: {
        Statement: Match.arrayWith([
          Match.objectLike({
            Effect: "Allow",
            Action: ["dynamodb:GetItem", "dynamodb:Query", "dynamodb:PutItem"],
            Resource:
              "arn:aws:dynamodb:eu-central-1:412381763181:table/TasanAppTable",
            Condition: {
              "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["cog_*"] },
            },
          }),
        ]),
      },
    });
  } finally {
    asset.mock.restore();
  }
});
