import * as cdk from "aws-cdk-lib";

import { TasanStack } from "./tasan-stack.js";

const app = new cdk.App();

new TasanStack(app, "TasanStack", {
  env: { region: "eu-central-1" },
});
