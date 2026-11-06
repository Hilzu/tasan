import { hash } from "node:crypto";

import { getLogger, withLogContext } from "@tasan/common/logging";
import type {
  CloudFrontRequestHandler,
  CloudFrontResultResponse,
} from "aws-lambda";

const probePrefixes = [
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

// Lambda function URLs verify the SigV4 signature against a normalized path, but CloudFront OAC
// signs the path exactly as the viewer sent it, so the function URL rejects paths with ".", "..",
// or empty segments with 403 InvalidSignatureException before the app runs. Redirecting to the
// normalized path makes the follow-up request signable and fixes the URL in the browser too.
// This mirrors SigV4 path normalization: empty and "." segments are dropped, ".." removes the
// previous segment, and a trailing slash is kept.
const normalizePath = (uri: string) => {
  const segments: string[] = [];
  for (const segment of uri.split("/")) {
    if (segment === "" || segment === ".") continue;
    if (segment === "..") segments.pop();
    else segments.push(segment);
  }
  const trailingSlash = segments.length > 0 && uri.endsWith("/") ? "/" : "";
  return `/${segments.join("/")}${trailingSlash}`;
};

const redirectResponse = (location: string) =>
  ({
    status: "308",
    headers: {
      location: [{ value: location }],
      "cache-control": [{ value: "public, max-age=31536000" }],
    },
  }) satisfies CloudFrontResultResponse;

const notFoundResponse = {
  status: "404",
  headers: {
    "cache-control": [{ value: "public, max-age=31536000" }],
  },
} satisfies CloudFrontResultResponse;

// The app only serves same-origin GET, HEAD, and POST requests. CloudFront's allowed-method sets
// can't express that, so other methods are answered here. This also keeps a DELETE with a body
// from reaching the function URL, which rejects it with 403 InvalidSignatureException.
const allowedMethods = ["GET", "HEAD", "POST"];
const methodNotAllowedResponse = {
  status: "405",
  headers: {
    allow: [{ value: allowedMethods.join(", ") }],
  },
} satisfies CloudFrontResultResponse;

// Invite IDs grant access to a split. Everything after the prefix is redacted so that
// non-normalized forms such as /accept-invite//<inviteID> don't leak the ID either.
export const redactPath = (uri: string) =>
  uri.replace(/(\/accept-invite\/).*/, "$1[redacted]");

// In the future we should also host in us-east-2
// Edge caches to serve from: us-east-1, us-east-2, us-west-1, us-west-2, sa-east-1

// eslint-disable-next-line @typescript-eslint/require-await
export const handler: CloudFrontRequestHandler = async (event, context) => {
  const request = event.Records[0].cf.request;
  return withLogContext(
    {
      requestId: context.awsRequestId,
      method: request.method,
      path: redactPath(request.uri),
    },
    () => {
      getLogger().addContext(context);
      getLogger().debug("Edge request received");

      if (!allowedMethods.includes(request.method)) {
        getLogger().info("Method rejected", { status: 405 });
        return methodNotAllowedResponse;
      }

      if (probePrefixes.some((p) => request.uri.startsWith(p))) {
        getLogger().info("Probe request blocked", { status: 404 });
        return notFoundResponse;
      }

      const normalizedPath = normalizePath(request.uri);
      if (normalizedPath !== request.uri) {
        getLogger().info("Non-normalized path redirected", { status: 308 });
        const query = request.querystring ? `?${request.querystring}` : "";
        return redirectResponse(`${normalizedPath}${query}`);
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
