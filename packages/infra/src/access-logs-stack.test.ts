import assert from "node:assert/strict";
import { test } from "node:test";

import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { AccessLogsStack } from "./access-logs-stack.js";

const template = Template.fromStack(
  new AccessLogsStack(new App(), "AccessLogs", {
    env: { region: "us-east-1", account: "123456789012" },
    distributionID: "EDISTRIBUTION",
  }),
);

await test("access logs are kept for 90 days, shorter than application logs", () => {
  template.hasResourceProperties("AWS::Logs::LogGroup", {
    LogGroupName: "/aws/vendedlogs/cloudfront/TasanApp",
    RetentionInDays: 90,
  });
});

interface Resource {
  Properties: Record<string, unknown>;
  DependsOn?: string[];
}

const onlyResource = (type: string) => {
  const resources = Object.values(
    template.findResources(type) as Record<string, Resource>,
  );
  assert.equal(resources.length, 1, type);
  return resources[0];
};

// Renders an Fn::Join, showing references as ${Logical ID}.
const joined = (value: unknown) => {
  const [separator, parts] = (value as { "Fn::Join": [string, unknown[]] })[
    "Fn::Join"
  ];
  return parts
    .map((part) =>
      typeof part === "string" ? part : `\${${(part as { Ref: string }).Ref}}`,
    )
    .join(separator);
};

await test("the distribution's access logs are delivered to the log group as JSON", () => {
  const source = onlyResource("AWS::Logs::DeliverySource");
  assert.equal(source.Properties.Name, "TasanAppDistribution");
  assert.equal(source.Properties.LogType, "ACCESS_LOGS");
  assert.equal(
    joined(source.Properties.ResourceArn),
    `arn:\${AWS::Partition}:cloudfront::123456789012:distribution/EDISTRIBUTION`,
  );

  const logGroupID = Object.keys(
    template.findResources("AWS::Logs::LogGroup"),
  )[0];
  const destination = onlyResource("AWS::Logs::DeliveryDestination");
  assert.equal(destination.Properties.OutputFormat, "json");
  // The log group ARN must not carry the ":*" suffix of LogGroup.logGroupArn.
  assert.equal(
    joined(destination.Properties.DestinationResourceArn),
    `arn:\${AWS::Partition}:logs:us-east-1:123456789012:log-group:\${${logGroupID}}`,
  );

  const deliveries = Object.values(
    template.findResources("AWS::Logs::Delivery") as Record<
      string,
      { Properties: Record<string, unknown>; DependsOn?: string[] }
    >,
  );
  assert.equal(deliveries.length, 1);
  assert.equal(
    deliveries[0].Properties.DeliverySourceName,
    "TasanAppDistribution",
  );
  assert.equal(deliveries[0].DependsOn?.length, 1);
});
