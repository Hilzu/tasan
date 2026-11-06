import { aws_logs as logs } from "aws-cdk-lib";
import type { Construct } from "constructs";

export const logRetention = logs.RetentionDays.THIRTEEN_MONTHS;
// CloudFront access logs contain viewer IP addresses and are needed only for recent debugging.
export const accessLogRetention = logs.RetentionDays.THREE_MONTHS;

// Lambda@Edge execution regions, independent of the application's origin regions:
// https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/lambda-edge-permissions.html
const edgeRegions = [
  "us-east-1",
  "us-east-2",
  "us-west-1",
  "us-west-2",
  "ap-south-1",
  "ap-northeast-2",
  "ap-southeast-1",
  "ap-southeast-2",
  "ap-northeast-1",
  "eu-central-1",
  "eu-west-1",
  "eu-west-2",
  "sa-east-1",
];

export function configureEdgeLogRetention(
  scope: Construct,
  functionName: string,
  distributionID: string,
) {
  for (const region of edgeRegions) {
    // Adopt existing service-created groups, or create them before first use.
    new logs.LogRetention(scope, `EdgeFunctionLogs-${region}`, {
      logGroupName: `/aws/lambda/us-east-1.${functionName}`,
      logGroupRegion: region,
      retention: logRetention,
    });
    new logs.LogRetention(scope, `EdgeErrorLogs-${region}`, {
      logGroupName: `/aws/cloudfront/LambdaEdge/${distributionID}`,
      logGroupRegion: region,
      retention: logRetention,
    });
  }
}
