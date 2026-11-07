import * as cdk from "aws-cdk-lib";

import { AccessLogsStack } from "./access-logs-stack.js";
import { RegionalStack } from "./regional-stack.js";
import { TasanStack } from "./tasan-stack.js";

const app = new cdk.App();

const tasan = new TasanStack(app, "TasanStack", {
  env: { region: "eu-central-1", account: "412381763181" },
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

new RegionalStack(app, "OhioStack", {
  env: { region: "us-east-2", account: "412381763181" },
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
