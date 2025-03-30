import {
  aws_certificatemanager as acm,
  aws_cloudfront as cloudfront,
  aws_cloudfront_origins as origins,
  aws_cognito as cognito,
  aws_dynamodb as dynamodb,
  aws_iam as iam,
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

const publicRootFiles = ["favicon.ico", "robots.txt"];

export class TasanStack extends Stack {
  constructor(scope: Construct, id: string, props: StackProps) {
    super(scope, id, props);

    // TODO: Manage this certificate in the CDK in a separate us-east-1 stack
    const certificate = acm.Certificate.fromCertificateArn(
      this,
      "AppCertificate",
      "arn:aws:acm:us-east-1:412381763181:certificate/a2c73df1-9752-4e36-8291-57a24c48b9f4",
    );

    const userPool = new cognito.UserPool(this, "UserPool", {
      userPoolName: "TasanUserPool",
      featurePlan: cognito.FeaturePlan.ESSENTIALS,
      signInCaseSensitive: false,
      selfSignUpEnabled: true,
      deletionProtection: true,
      userVerification: {
        emailStyle: cognito.VerificationEmailStyle.CODE,
        emailSubject: "Verify your email for Tasan.app",
        emailBody: "Your verification code for Tasan.app is {####}",
      },
      standardAttributes: {
        email: { required: true },
      },
      signInAliases: {
        email: true,
        username: true,
        preferredUsername: true,
      },
      autoVerify: { email: true },
      signInPolicy: {
        allowedFirstAuthFactors: {
          password: true,
          passkey: false,
          emailOtp: false,
          smsOtp: false,
        },
      },
    });

    const userPoolDomain = userPool.addDomain("AppAuthCustomDomain", {
      customDomain: {
        domainName: "auth.tasan.app",
        certificate,
      },
      managedLoginVersion: cognito.ManagedLoginVersion.NEWER_MANAGED_LOGIN,
    });

    const userPoolWebClient = userPool.addClient("TasanAppWeb", {
      userPoolClientName: "TasanAppWebClient",
      generateSecret: true,
      authFlows: {
        user: true,
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        defaultRedirectUri: "https://tasan.app/auth-callback",
        callbackUrls: [
          "https://tasan.app/auth-callback",
          "http://localhost:5173/auth-callback",
        ],
        logoutUrls: ["https://tasan.app/", "http://localhost:5173/"],
      },
    });

    new cognito.CfnManagedLoginBranding(this, "AppManagedLoginBranding", {
      userPoolId: userPool.userPoolId,
      clientId: userPoolWebClient.userPoolClientId,
      useCognitoProvidedValues: true,
    });

    const appTable = new dynamodb.TableV2(this, "AppTable", {
      tableName: "TasanAppTable",
      partitionKey: { name: "pk", type: dynamodb.AttributeType.STRING },
      sortKey: { name: "sk", type: dynamodb.AttributeType.STRING },
      timeToLiveAttribute: "expiresAt",
      billing: dynamodb.Billing.provisioned({
        readCapacity: dynamodb.Capacity.autoscaled({ maxCapacity: 25 }),
        writeCapacity: dynamodb.Capacity.autoscaled({ maxCapacity: 25 }),
      }),
      deletionProtection: true,
      globalSecondaryIndexes: [
        {
          indexName: "GSI-SK-PK",
          partitionKey: { name: "sk", type: dynamodb.AttributeType.STRING },
          sortKey: { name: "pk", type: dynamodb.AttributeType.STRING },
          projectionType: dynamodb.ProjectionType.KEYS_ONLY,
        },
      ],
    });

    const appFunction = new nodejs.NodejsFunction(this, "AppFunction", {
      functionName: "TasanAppFn",
      runtime: lambda.Runtime.NODEJS_22_X,
      memorySize: 512,
      entry: "./src/app-function/main.mts",
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
          beforeBundling: (_inputDir, _outputDir) => [],
          beforeInstall: (_inputDir, _outputDir) => [],
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
        APP_ENV: "production",
        NODE_OPTIONS: "--enable-source-maps",
        NODE_ENV: "production",
        TABLE_NAME: appTable.tableName,
        ORIGIN_URL: "https://tasan.app",
        AUTH_SERVER_URL: userPool.userPoolProviderUrl,
        AUTH_CLIENT_ID: userPoolWebClient.userPoolClientId,
      },
    });

    appTable.grantReadWriteData(appFunction);

    appFunction.addToRolePolicy(
      new iam.PolicyStatement({
        actions: ["ssm:GetParameter*"],
        resources: [
          `arn:aws:ssm:${this.region}:${this.account}:parameter/tasan-app*`,
        ],
      }),
    );

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
        memorySize: 256,
        handler: "main.handler",
        code: lambda.Code.fromAsset("./dist/app-origin-request/", {
          exclude: ["*.mts", "*.map"],
        }),
      },
    );

    // const appViewerRequestFn = new cloudfront.Function(
    //   this,
    //   "AppViewerRequestFn",
    //   {
    //     functionName: "AppViewerRequestFn",
    //     code: cloudfront.FunctionCode.fromFile({
    //       filePath: "./src/cloudfront-functions/app-viewer-request.cjs",
    //     }),
    //     runtime: cloudfront.FunctionRuntime.JS_2_0,
    //     autoPublish: true,
    //   },
    // );
    //
    // const appViewerResponseFn = new cloudfront.Function(
    //   this,
    //   "AppViewerResponseFn",
    //   {
    //     functionName: "AppViewerResponseFn",
    //     code: cloudfront.FunctionCode.fromFile({
    //       filePath: "./src/cloudfront-functions/app-viewer-response.cjs",
    //     }),
    //     runtime: cloudfront.FunctionRuntime.JS_2_0,
    //     autoPublish: true,
    //   },
    // );

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
          // {
          //   function: appViewerRequestFn,
          //   eventType: cloudfront.FunctionEventType.VIEWER_REQUEST,
          // },
          // {
          //   function: appViewerResponseFn,
          //   eventType: cloudfront.FunctionEventType.VIEWER_RESPONSE,
          // },
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

    const userPoolDomainTarget = new r53targets.UserPoolDomainTarget(
      userPoolDomain,
    );
    new route53.ARecord(this, "AuthARecord", {
      zone: appHostedZone,
      recordName: "auth",
      target: route53.RecordTarget.fromAlias(userPoolDomainTarget),
    });
    new route53.AaaaRecord(this, "AuthAaaaRecord", {
      zone: appHostedZone,
      recordName: "auth",
      target: route53.RecordTarget.fromAlias(userPoolDomainTarget),
    });
  }
}
