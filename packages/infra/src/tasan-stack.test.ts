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
