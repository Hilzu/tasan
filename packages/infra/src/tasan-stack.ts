import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_dynamodb as dynamodb,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_route53 as route53,
  aws_route53_targets as r53targets,
  aws_s3 as s3,
  Duration,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";

import { getEnv } from "./env.js";

const publicRootFiles = ["favicon.ico"];

export class TasanStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // TODO: Manage this certificate in the CDK in a separate us-east-1 stack
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "AppCertificate",
      "arn:aws:acm:us-east-1:412381763181:certificate/a2c73df1-9752-4e36-8291-57a24c48b9f4",
    );

    const appTable = new dynamodb.TableV2(this, "AppTable", {
      tableName: "TasanAppTable",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
      billing: dynamodb.Billing.provisioned({
        readCapacity: dynamodb.Capacity.autoscaled({ maxCapacity: 25 }),
        writeCapacity: dynamodb.Capacity.autoscaled({ maxCapacity: 25 }),
      }),
    });

    const appFunction = new nodejs.NodejsFunction(this, "AppFunction", {
      functionName: "TasanAppFn",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      entry: "./src/app-function.mts",
      architecture: lambda.Architecture.X86_64,
      tracing: lambda.Tracing.ACTIVE,
      bundling: {
        charset: nodejs.Charset.UTF8,
        minify: true,
        sourceMap: true,
        target: "es2022",
        format: OutputFormat.ESM,
        banner:
          'import {createRequire} from "module"; const require = createRequire(import.meta.url);',
        commandHooks: {
          beforeBundling: (_inputDir, _outputDir) => {
            return [];
          },
          beforeInstall: (_inputDir, _outputDir) => {
            return [];
          },
          afterBundling: (_inputDir, outputDir) => {
            // For XRay SDK
            return [
              `cd ${outputDir}`,
              "echo {} > package.json",
              `npm install @smithy/service-error-classification@^2.0.4`,
            ];
          },
        },
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        NODE_ENV: "production",
        TABLE_NAME: appTable.tableName,
        COOKIE_SIGN_SECRET: getEnv("COOKIE_SIGN_SECRET"),
        ORIGIN_URL: "https://tasan.app",
      },
    });

    appTable.grantReadWriteData(appFunction);

    new logs.LogGroup(this, "AppLogGroup", {
      logGroupName: `/aws/lambda/${appFunction.functionName}`,
      retention: logs.RetentionDays.THIRTEEN_MONTHS,
    });

    const appFunctionUrl = appFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    const assetsBucket = new s3.Bucket(this, "AppAssetsBucket");

    const responseHeadersPolicy = new cloudfront.ResponseHeadersPolicy(
      this,
      "AppResponseHeadersPolicy",
      {
        securityHeadersBehavior: {
          contentTypeOptions: { override: true },
          strictTransportSecurity: {
            accessControlMaxAge: Duration.days(365),
            override: true,
          },
        },
      },
    );

    const functionCachePolicy = new cloudfront.CachePolicy(
      this,
      "AppFunctionCachePolicy",
      {
        minTtl: Duration.seconds(0),
        defaultTtl: Duration.seconds(0),
        maxTtl: Duration.days(365),
        enableAcceptEncodingGzip: true,
        enableAcceptEncodingBrotli: true,
        queryStringBehavior: cloudfront.CacheQueryStringBehavior.all(),
        headerBehavior: cloudfront.CacheHeaderBehavior.none(),
        cookieBehavior: cloudfront.CacheCookieBehavior.none(),
      },
    );

    const appOriginRequestFunc = new cloudfront.experimental.EdgeFunction(
      this,
      "AppOriginRequestFunc",
      {
        functionName: "AppOriginRequestFn",
        runtime: lambda.Runtime.NODEJS_22_X,
        handler: "main.handler",
        code: lambda.Code.fromAsset("./dist/app-origin-request/", {
          exclude: ["*.mts", "*.map"],
        }),
      },
    );

    const appViewerRequestFn = new cloudfront.Function(
      this,
      "AppViewerRequestFn",
      {
        functionName: "AppViewerRequestFn",
        code: cloudfront.FunctionCode.fromFile({
          filePath: "./src/cloudfront-functions/app-viewer-request.cjs",
        }),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        autoPublish: true,
      },
    );

    const appViewerResponseFn = new cloudfront.Function(
      this,
      "AppViewerResponseFn",
      {
        functionName: "AppViewerResponseFn",
        code: cloudfront.FunctionCode.fromFile({
          filePath: "./src/cloudfront-functions/app-viewer-response.cjs",
        }),
        runtime: cloudfront.FunctionRuntime.JS_2_0,
        autoPublish: true,
      },
    );

    const distribution = new cloudfront.Distribution(this, "AppDistribution", {
      domainNames: ["tasan.app"],
      certificate,
      defaultBehavior: {
        origin:
          origins.FunctionUrlOrigin.withOriginAccessControl(appFunctionUrl),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: functionCachePolicy,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy,
        edgeLambdas: [
          {
            eventType: cloudfront.LambdaEdgeEventType.ORIGIN_REQUEST,
            functionVersion: appOriginRequestFunc.currentVersion,
            includeBody: true,
          },
        ],
        functionAssociations: [
          {
            function: appViewerRequestFn,
            eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          },
          {
            function: appViewerResponseFn,
            eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
          },
        ],
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
      enableLogging: false,
    });

    const assetOrigin =
      origins.S3BucketOrigin.withOriginAccessControl(assetsBucket);

    distribution.addBehavior("assets/*", assetOrigin, {
      allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
      viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
      responseHeadersPolicy,
    });

    for (const file of publicRootFiles) {
      distribution.addBehavior(file, assetOrigin, {
        allowedMethods: cloudfront.AllowedMethods.ALLOW_GET_HEAD,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy,
      });
    }

    const appHostedZone = new route53.HostedZone(this, "AppHostedZone", {
      zoneName: "tasan.app",
    });
    const cloudFrontTarget = new r53targets.CloudFrontTarget(distribution);
    new route53.ARecord(this, "AppARecord", {
      zone: appHostedZone,
      target: route53.RecordTarget.fromAlias(cloudFrontTarget),
    });
    new route53.AaaaRecord(this, "AppAaaaRecord", {
      zone: appHostedZone,
      target: route53.RecordTarget.fromAlias(cloudFrontTarget),
    });
  }
}
