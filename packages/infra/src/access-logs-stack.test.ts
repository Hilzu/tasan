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

interface Resource {
  Properties: Record<string, unknown>;
  DependsOn?: string[];
  DeletionPolicy?: string;
}

// Returns the logical ID and definition of the only resource of a type.
const onlyResource = (type: string): [string, Resource] => {
  const resources = Object.entries(
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

const [logGroupID, logGroup] = onlyResource("AWS::Logs::LogGroup");
const logGroupArn = `arn:\${AWS::Partition}:logs:us-east-1:123456789012:log-group:\${${logGroupID}}`;

await test("access logs are kept for 90 days and removed with the stack", () => {
  assert.equal(
    logGroup.Properties.LogGroupName,
    "/aws/vendedlogs/cloudfront/TasanApp",
  );
  assert.equal(logGroup.Properties.RetentionInDays, 90);
  // A retained group would block redeploying after a failed first deployment.
  assert.equal(logGroup.DeletionPolicy, "Delete");
});

await test("the distribution's access logs are delivered to the log group as JSON", () => {
  const [sourceID, source] = onlyResource("AWS::Logs::DeliverySource");
  assert.equal(source.Properties.Name, "TasanAppDistribution");
  assert.equal(source.Properties.LogType, "ACCESS_LOGS");
  assert.equal(
    joined(source.Properties.ResourceArn),
    `arn:\${AWS::Partition}:cloudfront::123456789012:distribution/EDISTRIBUTION`,
  );

  const [, destination] = onlyResource("AWS::Logs::DeliveryDestination");
  assert.equal(destination.Properties.OutputFormat, "json");
  // The log group ARN must not carry the ":*" suffix of LogGroup.logGroupArn.
  assert.equal(
    joined(destination.Properties.DestinationResourceArn),
    logGroupArn,
  );

  const [policyID] = onlyResource("AWS::Logs::ResourcePolicy");
  const [, delivery] = onlyResource("AWS::Logs::Delivery");
  assert.equal(delivery.Properties.DeliverySourceName, "TasanAppDistribution");
  // The source name is a plain string, so the dependencies must be explicit.
  assert.deepEqual(delivery.DependsOn?.toSorted(), [policyID, sourceID].sort());
});

await test("logged fields include the full request and origin details but no cookies", () => {
  const [, delivery] = onlyResource("AWS::Logs::Delivery");
  const fields = delivery.Properties.RecordFields as string[];
  for (const field of [
    "cs-uri-stem",
    "cs-uri-query",
    "cs(Referer)",
    "c-ip",
    "s-ip",
    "r-host",
    "sc-status",
    "x-edge-detailed-result-type",
  ]) {
    assert.ok(fields.includes(field), field);
  }
  assert.ok(!fields.includes("cs(Cookie)"));
  assert.equal(new Set(fields).size, fields.length);
});

await test("only this distribution's log delivery may write to the log group", () => {
  const [, policy] = onlyResource("AWS::Logs::ResourcePolicy");
  const document = JSON.parse(
    joined(policy.Properties.PolicyDocument).replaceAll(
      `\${${logGroupID}}`,
      "LOG_GROUP",
    ),
  ) as {
    Statement: {
      Principal: unknown;
      Action: string[];
      Resource: string;
      Condition: unknown;
    }[];
  };
  assert.equal(document.Statement.length, 1);
  const [statement] = document.Statement;
  assert.deepEqual(statement.Principal, {
    Service: "delivery.logs.amazonaws.com",
  });
  assert.deepEqual(statement.Action, [
    "logs:CreateLogStream",
    "logs:PutLogEvents",
  ]);
  assert.equal(
    statement.Resource,
    `${logGroupArn.replace(`\${${logGroupID}}`, "LOG_GROUP")}:log-stream:*`,
  );
  assert.deepEqual(statement.Condition, {
    StringEquals: { "aws:SourceAccount": "123456789012" },
    ArnLike: {
      "aws:SourceArn":
        "arn:${AWS::Partition}:logs:us-east-1:123456789012:delivery-source:TasanAppDistribution",
    },
  });
});
