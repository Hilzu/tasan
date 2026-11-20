import { test } from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { TasanStack } from "./tasan-stack.js";

await test("table and index use on-demand billing across all replicas", () => {
  const stack = new TasanStack(new App(), "TasanStack", {
    env: { account: "412381763181", region: "eu-central-1" },
  });
  Template.fromStack(stack).hasResourceProperties(
    "AWS::DynamoDB::GlobalTable",
    {
      BillingMode: "PAY_PER_REQUEST",
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "GSI-SK-PK",
        }),
      ]),
      Replicas: Match.arrayWith(
        ["ap-southeast-1", "us-east-2", "eu-central-1"].map((Region) =>
          Match.objectLike({ Region }),
        ),
      ),
    },
  );
});

await test("parameter sync IAM covers only the application parameter hierarchy", () => {
  const stack = new TasanStack(
    new App({ context: { "@aws-cdk/core:enablePartitionLiterals": true } }),
    "TasanStack",
    { env: { account: "412381763181", region: "eu-central-1" } },
  );
  const template = Template.fromStack(stack);
  template.hasResourceProperties("AWS::IAM::Policy", {
    PolicyDocument: Match.objectLike({
      Statement: Match.arrayWith([
        Match.objectLike({
          Action: "ssm:GetParametersByPath",
          Resource: [
            "arn:aws:ssm:eu-central-1:412381763181:parameter/tasan-app",
            "arn:aws:ssm:eu-central-1:412381763181:parameter/tasan-app/*",
          ],
        }),
        Match.objectLike({
          Action: "ssm:PutParameter",
          Resource: [
            "arn:aws:ssm:ap-southeast-1:412381763181:parameter/tasan-app/*",
            "arn:aws:ssm:us-east-2:412381763181:parameter/tasan-app/*",
          ],
        }),
      ]),
    }),
  });
});
