import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_lambda as lambda,
  aws_lambda_nodejs as nodejs,
  aws_logs as logs,
  aws_route53 as route53,
  aws_route53_targets as r53targets,
  aws_s3 as s3,
  aws_s3_deployment as s3deployment,
  Duration,
  Stack,
  type StackProps,
} from "aws-cdk-lib";
import { OutputFormat } from "aws-cdk-lib/aws-lambda-nodejs";
import type { Construct } from "constructs";

const publicRootFiles = ["favicon.ico"];

export class TasanStack extends Stack {
  constructor(scope: Construct, id: string, props?: StackProps) {
    super(scope, id, props);

    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "AppCertificate",
      "arn:aws:acm:us-east-1:412381763181:certificate/a2c73df1-9752-4e36-8291-57a24c48b9f4",
    );

    const appFunction = new nodejs.NodejsFunction(this, "AppFunction", {
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 256,
      entry: "./src/app-function.mts",
      architecture: lambda.Architecture.ARM_64,
      bundling: {
        charset: nodejs.Charset.UTF8,
        minify: true,
        sourceMap: true,
        target: "es2022",
        format: OutputFormat.ESM,
        banner:
          'import {createRequire} from "module"; const require = createRequire(import.meta.url);',
      },
      environment: {
        NODE_OPTIONS: "--enable-source-maps",
        NODE_ENV: "production",
      },
    });

    new logs.LogGroup(this, "AppLogGroup", {
      logGroupName: `/aws/lambda/${appFunction.functionName}`,
      retention: logs.RetentionDays.THIRTEEN_MONTHS,
    });

    const appFunctionUrl = appFunction.addFunctionUrl({
      authType: lambda.FunctionUrlAuthType.AWS_IAM,
      invokeMode: lambda.InvokeMode.BUFFERED,
    });

    const assetsBucket = new s3.Bucket(this, "AppAssetsBucket");

    new s3deployment.BucketDeployment(this, "AppAssetsDeployment", {
      sources: [
        s3deployment.Source.asset("../web/build/client", {
          exclude: publicRootFiles,
        }),
      ],
      destinationBucket: assetsBucket,
      cacheControl: [
        s3deployment.CacheControl.setPublic(),
        s3deployment.CacheControl.maxAge(Duration.days(365)),
        s3deployment.CacheControl.immutable(),
      ],
      prune: false,
    });

    new s3deployment.BucketDeployment(this, "AppNonAssetsDeployment", {
      sources: [
        s3deployment.Source.asset("../web/build/client", {
          exclude: ["*", ...publicRootFiles.map((file) => `!${file}`)],
        }),
      ],
      destinationBucket: assetsBucket,
      cacheControl: [
        s3deployment.CacheControl.setPublic(),
        s3deployment.CacheControl.maxAge(Duration.days(14)),
      ],
      prune: false,
    });

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

    const distribution = new cloudfront.Distribution(this, "AppDistribution", {
      domainNames: ["tasan.app"],
      certificate,
      defaultBehavior: {
        origin:
          origins.FunctionUrlOrigin.withOriginAccessControl(appFunctionUrl),
        allowedMethods: cloudfront.AllowedMethods.ALLOW_ALL,
        cachePolicy: cloudfront.CachePolicy.CACHING_DISABLED,
        originRequestPolicy:
          cloudfront.OriginRequestPolicy.ALL_VIEWER_EXCEPT_HOST_HEADER,
        viewerProtocolPolicy: cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
        responseHeadersPolicy,
      },
      priceClass: cloudfront.PriceClass.PRICE_CLASS_ALL,
      httpVersion: cloudfront.HttpVersion.HTTP2_AND_3,
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
