import assert from "node:assert/strict";
import { test } from "node:test";

import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { DnssecAlarmsStack } from "./dnssec-alarms-stack.js";

const template = Template.fromStack(
  new DnssecAlarmsStack(new App(), "DnssecAlarms", {
    env: { region: "us-east-1", account: "123456789012" },
    hostedZoneID: "ZHOSTEDZONE",
  }),
);

interface AlarmProperties {
  Namespace: string;
  MetricName: string;
  Dimensions: { Name: string; Value: string }[];
  Statistic: string;
  Threshold: number;
  ComparisonOperator: string;
  TreatMissingData: string;
  AlarmActions: unknown[];
  OKActions: unknown[];
}

const topics = Object.keys(template.findResources("AWS::SNS::Topic"));
assert.equal(topics.length, 1);
const [topicID] = topics;

const alarms = new Map(
  Object.values(
    template.findResources("AWS::CloudWatch::Alarm") as Record<
      string,
      { Properties: AlarmProperties }
    >,
  ).map(({ Properties }) => [Properties.MetricName, Properties]),
);

await test("both of Route 53's DNSSEC failure metrics are alarmed", () => {
  assert.deepEqual([...alarms.keys()].sort(), [
    "DNSSECInternalFailure",
    "DNSSECKeySigningKeysNeedingAction",
  ]);
});

await test("alarms fire on the first report for the app's hosted zone", () => {
  for (const alarm of alarms.values()) {
    assert.equal(alarm.Namespace, "AWS/Route53");
    assert.deepEqual(alarm.Dimensions, [
      { Name: "HostedZoneId", Value: "ZHOSTEDZONE" },
    ]);
    assert.equal(alarm.Statistic, "Maximum");
    assert.equal(alarm.Threshold, 1);
    assert.equal(alarm.ComparisonOperator, "GreaterThanOrEqualToThreshold");
    assert.equal(alarm.TreatMissingData, "notBreaching");
  }
});

await test("alarm and recovery notifications go to the alarm topic", () => {
  for (const alarm of alarms.values()) {
    assert.deepEqual(alarm.AlarmActions, [{ Ref: topicID }]);
    assert.deepEqual(alarm.OKActions, [{ Ref: topicID }]);
  }
});
