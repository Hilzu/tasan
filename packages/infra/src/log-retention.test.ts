import assert from "node:assert/strict";
import { test } from "node:test";

import {
  App,
  aws_lambda as lambda,
  aws_logs as logs,
  Stack,
} from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import {
  configureEdgeLogRetention,
  configureLogRetention,
} from "./log-retention.js";

const retentionResources = (template: Template) =>
  Object.values(
    template.findResources("Custom::LogRetention") as Record<
      string,
      { Properties: Record<string, unknown> }
    >,
  );

await test("application, CDK helper and declared log groups all expire after 13 months", () => {
  const app = new App();
  configureLogRetention(app);
  const stack = new Stack(app, "Logs", {
    env: { account: "412381763181", region: "eu-central-1" },
  });
  new lambda.Function(stack, "App", {
    code: lambda.Code.fromInline("exports.handler = async () => {};"),
    handler: "index.handler",
    runtime: lambda.Runtime.NODEJS_24_X,
  });
  new logs.LogGroup(stack, "ExplicitLogs", {
    retention: logs.RetentionDays.ONE_DAY,
  });
  const template = Template.fromStack(stack);
  template.hasResourceProperties("AWS::Logs::LogGroup", {
    RetentionInDays: 400,
  });
  const retentions = retentionResources(template);
  assert.ok(
    retentions.length >= 2,
    "also covers the retention provider itself",
  );
  for (const resource of retentions)
    assert.equal(resource.Properties.RetentionInDays, 400);
  for (const id of Object.keys(
    template.findResources("AWS::Lambda::Function"),
  )) {
    assert.ok(
      retentions.some((resource) =>
        JSON.stringify(resource.Properties.LogGroupName).includes(
          `"Ref":"${id}"`,
        ),
      ),
      `missing retention for ${id}`,
    );
  }
});

await test("both edge function and CloudFront error logs are covered in every edge region", () => {
  const stack = new Stack(new App(), "EdgeLogs");
  configureEdgeLogRetention(stack, "AppOriginRequestFn", "EDISTRIBUTION");
  const template = Template.fromStack(stack);
  const resources = retentionResources(template);
  for (const name of [
    "/aws/lambda/us-east-1.AppOriginRequestFn",
    "/aws/cloudfront/LambdaEdge/EDISTRIBUTION",
  ]) {
    const groups = resources.filter((r) => r.Properties.LogGroupName === name);
    assert.deepEqual(groups.map((r) => r.Properties.LogGroupRegion).sort(), [
      "ap-northeast-1",
      "ap-northeast-2",
      "ap-south-1",
      "ap-southeast-1",
      "ap-southeast-2",
      "eu-central-1",
      "eu-west-1",
      "eu-west-2",
      "sa-east-1",
      "us-east-1",
      "us-east-2",
      "us-west-1",
      "us-west-2",
    ]);
    for (const group of groups) {
      assert.equal(group.Properties.RetentionInDays, 400);
      assert.equal(group.Properties.RemovalPolicy, undefined);
    }
  }
  // Existing groups are updated by custom resources, not recreated by CloudFormation.
  assert.equal(
    Object.values(template.findResources("AWS::Logs::LogGroup")).length,
    0,
  );
});
