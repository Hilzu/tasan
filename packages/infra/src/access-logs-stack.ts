import {
  ArnFormat,
  aws_logs as logs,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

import { accessLogRetention } from "./log-retention.js";

type Props = StackProps & {
  distributionID: string;
};

// CloudFront standard logging (v2) delivers access logs through CloudWatch Logs vended log
// delivery, which must be configured in us-east-1. Cookie logging stays off, so session
// cookies are not logged.
export class AccessLogsStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    const { distributionID, ...rest } = props;
    super(scope, id, rest);

    // Vended logs should use the /aws/vendedlogs/ prefix to keep log delivery resource
    // policies within their size limit.
    const logGroup = new logs.LogGroup(this, "AppAccessLogs", {
      logGroupName: "/aws/vendedlogs/cloudfront/TasanApp",
      retention: accessLogRetention,
    });

    const source = new logs.CfnDeliverySource(this, "AppAccessLogSource", {
      name: "TasanAppDistribution",
      logType: "ACCESS_LOGS",
      resourceArn: this.formatArn({
        service: "cloudfront",
        region: "",
        resource: "distribution",
        resourceName: distributionID,
      }),
    });

    const destination = new logs.CfnDeliveryDestination(
      this,
      "AppAccessLogDestination",
      {
        name: "TasanAppAccessLogs",
        outputFormat: "json",
        // The log group ARN without the ":*" suffix that LogGroup.logGroupArn includes.
        destinationResourceArn: this.formatArn({
          service: "logs",
          resource: "log-group",
          resourceName: logGroup.logGroupName,
          arnFormat: ArnFormat.COLON_RESOURCE_NAME,
        }),
      },
    );

    const delivery = new logs.CfnDelivery(this, "AppAccessLogDelivery", {
      deliverySourceName: source.name,
      deliveryDestinationArn: destination.attrArn,
    });
    delivery.addDependency(source);
  }
}
