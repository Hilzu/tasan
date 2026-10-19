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
  cognitoMappingRegion: string;
  userPoolServerURL: string;
  appClientID: string;
  appFunctionAssetPath: string;
  distributionID: string;
};

export class RegionalStack extends Stack {
  constructor(scope: Construct, id: string, props: Props) {
    const {
      tableName,
      cognitoMappingRegion,
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
      runtime: lambda.Runtime.NODEJS_24_X,
      code: lambda.Code.fromAsset(`cdk.out/${appFunctionAssetPath}`),
      handler: "index.handler",
      memorySize: 512,
      architecture: lambda.Architecture.X86_64,
      tracing: lambda.Tracing.ACTIVE,
      loggingFormat: lambda.LoggingFormat.JSON,
      applicationLogLevelV2: lambda.ApplicationLogLevel.INFO,
      environment: {
        APP_ENV: "production",
        NODE_OPTIONS: "--enable-source-maps",
        NODE_ENV: "production",
        TABLE_NAME: tableName,
        COGNITO_MAPPING_REGION: cognitoMappingRegion,
        ORIGIN_URL: "https://tasan.app",
        AUTH_SERVER_URL: userPoolServerURL,
        AUTH_CLIENT_ID: appClientID,
      },
    });

    appTable.grantReadWriteData(appFunction);

    appFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: [
          "dynamodb:GetItem",
          "dynamodb:Query",
          "dynamodb:PutItem",
          "dynamodb:DeleteItem",
        ],
        resources: [
          this.formatArn({
            service: "dynamodb",
            region: cognitoMappingRegion,
            resource: "table",
            resourceName: tableName,
          }),
        ],
        conditions: {
          "ForAllValues:StringLike": { "dynamodb:LeadingKeys": ["cog_*"] },
        },
      }),
    );

    appFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter*"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/tasan-app*`,
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
