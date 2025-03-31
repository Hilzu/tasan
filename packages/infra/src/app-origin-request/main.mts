import { hash } from "node:crypto";

import type {
  CloudFrontRequestHandler,
  CloudFrontResultResponse,
} from "aws-lambda";

const probePrefixes = [
  "//",
  "/wp-admin",
  "/wordpress",
  "/.env",
  "/.git",
  "/wp-content",
];

// These correspond to CloudFront regional edge cache locations that this function executes in.
const regionsServedFromSingapore = [
  "ap-southeast-1", // Singapore
  "ap-southeast-2", // Sydney
  "ap-northeast-1", // Tokyo
  "ap-northeast-2", // Seoul
  "ap-south-1", // Mumbai
];
const singaporeLambdaFunctionDomain =
  "cxh43kp2vsbbrb4vgwpratjkpi0ekjjk.lambda-url.ap-southeast-1.on.aws";

// In the future we should also host in us-east-2
// Edge caches to serve from: us-east-1, us-east-2, us-west-1, us-west-2, sa-east-1

// eslint-disable-next-line @typescript-eslint/require-await
export const handler: CloudFrontRequestHandler = async (event) => {
  const request = event.Records[0].cf.request;
  console.log("Handling request", {
    method: request.method,
    uri: request.uri,
    querystring: request.querystring,
  });

  if (probePrefixes.some((p) => request.uri.startsWith(p))) {
    console.log("Blocking probe request");
    return {
      status: "404",
      headers: {
        "cache-control": [{ value: "public, max-age=31536000" }],
      },
    } satisfies CloudFrontResultResponse;
  }

  const region = process.env.AWS_REGION;
  const forceSingapore = Boolean(request.headers["x-force-singapore"]);
  if (regionsServedFromSingapore.includes(region ?? "") || forceSingapore) {
    console.log("Writing origin to Singapore");
    request.origin = {
      custom: {
        protocol: "https",
        domainName: singaporeLambdaFunctionDomain,
        port: 443,
        path: "",
        sslProtocols: ["TLSv1.2"],
        readTimeout: 30,
        keepaliveTimeout: 5,
        customHeaders: {},
      },
    };
    request.headers.host = [{ value: singaporeLambdaFunctionDomain }];
  }

  // Calculate body hash for lambda auth
  // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html#create-oac-overview-lambda
  if (!request.body?.data) return request;
  if (request.body.inputTruncated) {
    console.log("Request body too large");
    return {
      body: "Request body too large",
      bodyEncoding: "text",
      status: "413",
    } satisfies CloudFrontResultResponse;
  }

  const encoding = request.body.encoding === "base64" ? "base64" : "utf8";
  const buffer = Buffer.from(request.body.data, encoding);
  const digest = hash("sha256", buffer);

  request.headers["x-amz-content-sha256"] = [{ value: digest }];

  return request;
};
