import {
  aws_cloudfront as cloudfront,
  aws_lambda as lambda,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

export class VirginiaStack extends Stack {
  appOriginRequestFunc: cloudfront.experimental.EdgeFunction;

  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);
    this.appOriginRequestFunc = new cloudfront.experimental.EdgeFunction(
      this,
      "CalculateBodyHash",
      {
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "main.handler",
        code: lambda.Code.fromAsset("./dist/app-origin-request/", {
          exclude: ["*.mts", "*.map"],
        }),
      },
    );
  }
}
