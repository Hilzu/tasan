import * as cdk from "aws-cdk-lib";

import { AccessLogsStack } from "./access-logs-stack.js";
import { DnssecAlarmsStack } from "./dnssec-alarms-stack.js";
import { DnssecKeyStack } from "./dnssec-key-stack.js";
import { RegionalStack } from "./regional-stack.js";
import { TasanStack } from "./tasan-stack.js";

const app = new cdk.App();

const dnssecKey = new DnssecKeyStack(app, "DnssecKeyStack", {
  env: { region: "us-east-1", account: "412381763181" },
});

const tasan = new TasanStack(app, "TasanStack", {
  env: { region: "eu-central-1", account: "412381763181" },
  crossRegionReferences: true,

  dnssecKeyArn: dnssecKey.keyArn,
});

new RegionalStack(app, "SingaporeStack", {
  env: { region: "ap-southeast-1", account: "412381763181" },
  crossRegionReferences: true,

  tableName: tasan.tableName,
  userPoolServerURL: tasan.userPoolServerURL,
  appClientID: tasan.appClientID,
  appFunctionAssetPath: tasan.appFunctionAssetPath,
  distributionID: tasan.distributionID,
});

new AccessLogsStack(app, "AccessLogsStack", {
  env: { region: "us-east-1", account: "412381763181" },
  crossRegionReferences: true,

  distributionID: tasan.distributionID,
});

new DnssecAlarmsStack(app, "DnssecAlarmsStack", {
  env: { region: "us-east-1", account: "412381763181" },
  crossRegionReferences: true,

  hostedZoneID: tasan.hostedZoneID,
});
