import {
  ArnFormat,
  aws_iam as iam,
  aws_logs as logs,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

import { accessLogRetention } from "./log-retention.js";

type Props = StackProps & {
  distributionID: string;
};

const deliverySourceName = "TasanAppDistribution";

// Query strings carry OAuth callback codes and search terms, and same-origin referrers carry
// full page URLs such as invite links, so cs-uri-query and cs(Referer) are left out. Cookie
// logging stays off on the distribution. Invite IDs still appear in cs-uri-stem for
// /accept-invite requests; invites expire after five days and the logs after 90.
const recordFields = [
  "timestamp(ms)",
  "x-edge-location",
  "x-edge-request-id",
  "x-host-header",
  "c-ip",
  "x-forwarded-for",
  "c-port",
  "c-country",
  "asn",
  "cs-protocol",
  "cs-protocol-version",
  "ssl-protocol",
  "ssl-cipher",
  "cs-method",
  "cs-uri-stem",
  "cs-bytes",
  "cs(User-Agent)",
  "sc-status",
  "sc-bytes",
  "sc-content-type",
  "sc-content-len",
  "x-edge-result-type",
  "x-edge-response-result-type",
  "x-edge-detailed-result-type",
  "cache-behavior-path-pattern",
  "time-taken",
  "time-to-first-byte",
  "origin-fbl",
  "origin-lbl",
];

// CloudFront standard logging (v2) delivers access logs through CloudWatch Logs vended log
// delivery, which must be configured in us-east-1.
export class AccessLogsStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    const { distributionID, ...rest } = props;
    super(scope, id, rest);

    // Vended logs should use the /aws/vendedlogs/ prefix to keep log delivery resource
    // policies within their size limit. The group is deleted with the stack so that a failed
    // first deployment doesn't leave a group behind that blocks the next attempt.
    const logGroup = new logs.LogGroup(this, "AppAccessLogs", {
      logGroupName: "/aws/vendedlogs/cloudfront/TasanApp",
      retention: accessLogRetention,
      removalPolicy: RemovalPolicy.DESTROY,
    });
    // The log group ARN without the ":*" suffix that LogGroup.logGroupArn includes.
    const logGroupArn = this.formatArn({
      service: "logs",
      resource: "log-group",
      resourceName: logGroup.logGroupName,
      arnFormat: ArnFormat.COLON_RESOURCE_NAME,
    });

    // Without this, AWS adds an equivalent policy outside CloudFormation when the delivery is
    // created, and only if the deploying role may change resource policies.
    const deliveryPolicy = new logs.ResourcePolicy(this, "AppAccessLogPolicy", {
      resourcePolicyName: "TasanAppAccessLogDelivery",
      policyStatements: [
        new iam.PolicyStatement({
          principals: [new iam.ServicePrincipal("delivery.logs.amazonaws.com")],
          actions: ["logs:CreateLogStream", "logs:PutLogEvents"],
          resources: [`${logGroupArn}:log-stream:*`],
          conditions: {
            StringEquals: { "aws:SourceAccount": this.account },
            ArnLike: {
              "aws:SourceArn": this.formatArn({
                service: "logs",
                resource: "delivery-source",
                resourceName: deliverySourceName,
                arnFormat: ArnFormat.COLON_RESOURCE_NAME,
              }),
            },
          },
        }),
      ],
    });

    const source = new logs.CfnDeliverySource(this, "AppAccessLogSource", {
      name: deliverySourceName,
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
        destinationResourceArn: logGroupArn,
      },
    );

    const delivery = new logs.CfnDelivery(this, "AppAccessLogDelivery", {
      deliverySourceName: source.name,
      deliveryDestinationArn: destination.attrArn,
      recordFields,
    });
    delivery.addDependency(source);
    delivery.node.addDependency(deliveryPolicy);
  }
}
