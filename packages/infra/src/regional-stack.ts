import {
  aws_dynamodb as dynamodb,
  aws_iam as iam,
  aws_lambda as lambda,
  CfnOutput,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import type { Construct } from "constructs";

type Props = StackProps & {
  tableName: string;
  userPoolServerURL: string;
  appClientID: string;
  appFunctionAssetPath: string;
  distributionID: string;
};

export class RegionalStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    const {
      tableName,
      userPoolServerURL,
      appClientID,
      appFunctionAssetPath,
      distributionID,
      ...rest
    } = props;
    super(scope, id, rest);

    const appTable = dynamodb.TableV2.fromTableAttributes(this, "AppTable", {
      tableName,
      globalIndexes: ["GSI-SK-PK"],
      grantIndexPermissions: true,
    });

    const appFunction = new lambda.Function(this, "TasanFn", {
      functionName: "TasanAppFn",
      runtime: lambda.Runtime.NODEJS_22_X,
      code: lambda.Code.fromAsset(`cdk.out/${appFunctionAssetPath}`),
      handler: "index.handler",
      memorySize: 512,
      architecture: lambda.Architecture.X86_64,
      tracing: lambda.Tracing.ACTIVE,
      environment: {
        APP_ENV: "production",
        NODE_OPTIONS: "--enable-source-maps",
        NODE_ENV: "production",
        TABLE_NAME: tableName,
        ORIGIN_URL: "https://tasan.app",
        AUTH_SERVER_URL: userPoolServerURL,
        AUTH_CLIENT_ID: appClientID,
      },
    });

    appTable.grantReadWriteData(appFunction);

    appFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter*"],
        resources: [
          `arn:aws:ssm:eu-central-1:${this.account}:parameter/tasan-app*`,
        ],
      }),
    );

    const appFunctionUrl = appFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.NONE,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    const cfPrincipal = new iam.ServicePrincipal("cloudfront.amazonaws.com");
    appFunction.addPermission("CloudfrontInvoke", {
      principal: cfPrincipal,
      action: "lambda:InvokeFunctionUrl",
      sourceArn: `arn:aws:cloudfront::${this.account}:distribution/${distributionID}`,
    });

    new CfnOutput(this, "LambdaFunctionUrl", { value: appFunctionUrl.url });
  }
}
