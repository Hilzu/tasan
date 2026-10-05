import { App } from "aws-cdk-lib";

import { DeploymentAccessStack } from "./deployment-access-stack.js";

const app = new App();

new DeploymentAccessStack(app, "TasanDeploymentAccessStack", {
  env: { region: "eu-central-1", account: "412381763181" },
  terminationProtection: true,
});
