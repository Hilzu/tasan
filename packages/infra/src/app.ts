import * as cdk from "aws-cdk-lib";

import { TasanStack } from "./tasan-stack.js";
import { VirginiaStack } from "./virginia-stack.js";

const app = new cdk.App();

const virginiaStack = new VirginiaStack(app, "VirginiaStack", {
  env: { region: "us-east-1" },
});

new TasanStack(app, "TasanStack", {
  crossRegionReferences: true,
  env: { region: "eu-central-1" },
  appOriginRequestFunc: virginiaStack.appOriginRequestFunc,
});
