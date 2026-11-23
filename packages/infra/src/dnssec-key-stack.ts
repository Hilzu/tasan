import {
  aws_iam as iam,
  aws_kms as kms,
  RemovalPolicy,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

const dnssecPrincipal = new iam.ServicePrincipal(
  "dnssec-route53.amazonaws.com",
);

// Route 53 signs DNSSEC zones only with asymmetric P-256 KMS keys in us-east-1, so the key lives
// in its own stack there while the hosted zone stays in TasanStack.
// https://docs.aws.amazon.com/Route53/latest/DeveloperGuide/dns-configuring-dnssec-cmk-requirements.html
export class DnssecKeyStack extends Stack {
  keyArn: string;

  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    const key = new kms.Key(this, "KeySigningKey", {
      alias: "tasan-app-dnssec",
      description: "Signs the tasan.app hosted zone's DNSSEC key-signing key",
      keySpec: kms.KeySpec.ECC_NIST_P256,
      keyUsage: kms.KeyUsage.SIGN_VERIFY,
      // Losing the key while the parent zone still publishes its DS record would make the domain
      // unresolvable for validating resolvers, so it must outlive the stack.
      removalPolicy: RemovalPolicy.RETAIN,
    });

    // The hosted zone is created in another stack, so its ARN can't be referenced here without a
    // dependency cycle. Restrict Route 53 to this account's hosted zones instead.
    key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowRoute53DNSSECService",
        principals: [dnssecPrincipal],
        actions: ["kms:DescribeKey", "kms:GetPublicKey", "kms:Sign"],
        resources: ["*"],
        conditions: {
          StringEquals: { "aws:SourceAccount": this.account },
          ArnLike: { "aws:SourceArn": "arn:aws:route53:::hostedzone/*" },
        },
      }),
    );
    key.addToResourcePolicy(
      new iam.PolicyStatement({
        sid: "AllowRoute53DNSSECToCreateGrant",
        principals: [dnssecPrincipal],
        actions: ["kms:CreateGrant"],
        resources: ["*"],
        conditions: { Bool: { "kms:GrantIsForAWSResource": true } },
      }),
    );

    this.keyArn = key.keyArn;
  }
}
