import { hash } from "node:crypto";

import { getLogger, withLogContext } from "@tasan/common/logging";
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

// Lambda function URLs verify the SigV4 signature against a normalized path (no "." or ".."
// segments and no empty segments), but CloudFront OAC signs the path exactly as the viewer sent
// it. The function URL rejects such paths with 403 InvalidSignatureException before the app
// runs. Browsers resolve these segments themselves, so only scanners and malformed links send
// them; answering here keeps them from surfacing as signature errors.
const hasNonNormalizedSegments = (uri: string) => {
  const segments = uri.split("/").slice(1);
  return segments.some(
    (segment, index) =>
      segment === "." ||
      segment === ".." ||
      // A single trailing slash is allowed; it leaves one empty segment at the end.
      (segment === "" && index < segments.length - 1),
  );
};

const notFoundResponse = {
  status: "404",
  headers: {
    "cache-control": [{ value: "public, max-age=31536000" }],
  },
} satisfies CloudFrontResultResponse;

// In the future we should also host in us-east-2
// Edge caches to serve from: us-east-1, us-east-2, us-west-1, us-west-2, sa-east-1

// eslint-disable-next-line @typescript-eslint/require-await
export const handler: CloudFrontRequestHandler = async (event, context) => {
  const request = event.Records[0].cf.request;
  return withLogContext(
    {
      requestId: context.awsRequestId,
      method: request.method,
      path: request.uri.replace(/(\/accept-invite\/)[^/]+/, "$1[redacted]"),
    },
    () => {
      getLogger().addContext(context);
      getLogger().debug("Edge request received");

      if (probePrefixes.some((p) => request.uri.startsWith(p))) {
        getLogger().info("Probe request blocked", { status: 404 });
        return notFoundResponse;
      }

      if (hasNonNormalizedSegments(request.uri)) {
        getLogger().info("Non-normalized path rejected", { status: 404 });
        return notFoundResponse;
      }

      const region = process.env.AWS_REGION;
      const forceSingapore = Boolean(request.headers["x-force-singapore"]);
      if (regionsServedFromSingapore.includes(region ?? "") || forceSingapore) {
        getLogger().debug("Origin selected", {
          originRegion: "ap-southeast-1",
        });
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
        getLogger().info("Request body rejected", { status: 413 });
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
    },
  );
};
