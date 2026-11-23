import {
  aws_cloudwatch as cloudwatch,
  aws_cloudwatch_actions as actions,
  aws_sns as sns,
  CfnOutput,
  Duration,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

type Props = StackProps & {
  hostedZoneID: string;
};

// Route 53 publishes its DNSSEC metrics only in us-east-1, so the alarms can't live with the
// hosted zone in TasanStack. A signing failure isn't visible to users until the existing
// signatures expire, after which validating resolvers can't resolve the domain at all.
// https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring-dnssec-enable-signing.html
export class DnssecAlarmsStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    super(scope, id, props);

    // Subscribe to the topic outside CDK so that no address is committed to the repository.
    const topic = new sns.Topic(this, "AlarmTopic", {
      displayName: "Tasan.app DNSSEC alarms",
    });
    const topicAction = new actions.SnsAction(topic);

    const alarm = (id: string, metricName: string, description: string) => {
      const created = new cloudwatch.Alarm(this, id, {
        alarmDescription: description,
        metric: new cloudwatch.Metric({
          namespace: "AWS/Route53",
          metricName,
          dimensionsMap: { HostedZoneId: props.hostedZoneID },
          statistic: cloudwatch.Stats.MAXIMUM,
          period: Duration.minutes(5),
        }),
        threshold: 1,
        comparisonOperator:
          cloudwatch.ComparisonOperator.GREATER_THAN_OR_EQUAL_TO_THRESHOLD,
        evaluationPeriods: 1,
        // Route 53 reports these metrics only while DNSSEC signing is enabled for the zone.
        treatMissingData: cloudwatch.TreatMissingData.NOT_BREACHING,
      });
      created.addAlarmAction(topicAction);
      created.addOkAction(topicAction);
    };

    alarm(
      "InternalFailureAlarm",
      "DNSSECInternalFailure",
      "Route 53 can't sign the tasan.app hosted zone. Check the zone's DNSSEC status in Route 53 and resolve the reported problem before the existing signatures expire.",
    );
    alarm(
      "KeySigningKeysNeedingActionAlarm",
      "DNSSECKeySigningKeysNeedingAction",
      "A tasan.app key-signing key needs action, usually because its KMS key was disabled, deleted, or its key policy no longer allows Route 53. Restore the key or its policy in us-east-1.",
    );

    new CfnOutput(this, "AlarmTopicArn", { value: topic.topicArn });
  }
}
