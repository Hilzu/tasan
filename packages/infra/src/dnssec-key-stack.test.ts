import assert from "node:assert/strict";
import { test } from "node:test";

import { App } from "aws-cdk-lib";
import { Template } from "aws-cdk-lib/assertions";

import { DnssecKeyStack } from "./dnssec-key-stack.js";

const template = Template.fromStack(
  new DnssecKeyStack(new App(), "DnssecKey", {
    env: { region: "us-east-1", account: "123456789012" },
  }),
);

interface Statement {
  Sid?: string;
  Principal: Record<string, unknown>;
  Action: string | string[];
  Condition?: Record<string, Record<string, unknown>>;
}

const keys = Object.values(
  template.findResources("AWS::KMS::Key") as Record<
    string,
    {
      Properties: {
        KeySpec: string;
        KeyUsage: string;
        KeyPolicy: { Statement: Statement[] };
      };
      DeletionPolicy?: string;
    }
  >,
);
assert.equal(keys.length, 1);
const [key] = keys;

const statement = (sid: string) => {
  const found = key.Properties.KeyPolicy.Statement.find((s) => s.Sid === sid);
  assert.ok(found, sid);
  return found;
};

await test("the key meets Route 53's DNSSEC key-signing key requirements", () => {
  assert.equal(key.Properties.KeySpec, "ECC_NIST_P256");
  assert.equal(key.Properties.KeyUsage, "SIGN_VERIFY");
});

await test("the key survives stack deletion", () => {
  assert.equal(key.DeletionPolicy, "Retain");
});

await test("Route 53 can sign only for this account's hosted zones", () => {
  const sign = statement("AllowRoute53DNSSECService");
  assert.deepEqual(sign.Principal, {
    Service: "dnssec-route53.amazonaws.com",
  });
  assert.deepEqual(sign.Action, [
    "kms:DescribeKey",
    "kms:GetPublicKey",
    "kms:Sign",
  ]);
  assert.deepEqual(sign.Condition, {
    StringEquals: { "aws:SourceAccount": "123456789012" },
    ArnLike: { "aws:SourceArn": "arn:aws:route53:::hostedzone/*" },
  });
});

await test("Route 53 can create grants only for AWS resources", () => {
  const grant = statement("AllowRoute53DNSSECToCreateGrant");
  assert.equal(grant.Action, "kms:CreateGrant");
  assert.deepEqual(grant.Condition, {
    Bool: { "kms:GrantIsForAWSResource": true },
  });
});
