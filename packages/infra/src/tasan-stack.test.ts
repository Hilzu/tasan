import { test } from "node:test";

import { App } from "aws-cdk-lib";
import { Match, Template } from "aws-cdk-lib/assertions";

import { TasanStack } from "./tasan-stack.js";

await test("provisioned table and index have write seeds for the billing migration", () => {
  const stack = new TasanStack(new App(), "TasanStack", {
    env: { account: "412381763181", region: "eu-central-1" },
  });
  const writeThroughput = {
    WriteCapacityAutoScalingSettings: Match.objectLike({
      MaxCapacity: 25,
      MinCapacity: 1,
      SeedCapacity: 1,
    }),
  };
  Template.fromStack(stack).hasResourceProperties(
    "AWS::DynamoDB::GlobalTable",
    {
      BillingMode: "PROVISIONED",
      WriteProvisionedThroughputSettings: writeThroughput,
      GlobalSecondaryIndexes: Match.arrayWith([
        Match.objectLike({
          IndexName: "GSI-SK-PK",
          WriteProvisionedThroughputSettings: writeThroughput,
        }),
      ]),
      Replicas: Match.arrayWith(
        ["ap-southeast-1", "us-east-2", "eu-central-1"].map((Region) =>
          Match.objectLike({
            Region,
            ReadProvisionedThroughputSettings: { ReadCapacityUnits: 20 },
            GlobalSecondaryIndexes: Match.arrayWith([
              Match.objectLike({
                IndexName: "GSI-SK-PK",
                ReadProvisionedThroughputSettings: { ReadCapacityUnits: 5 },
              }),
            ]),
          }),
        ),
      ),
    },
  );
});
