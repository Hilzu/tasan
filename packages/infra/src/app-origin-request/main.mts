import { hash } from "node:crypto";

import type {
  CloudFrontRequestHandler,
  CloudFrontResultResponse,
} from "aws-lambda";

const probePrefixes = ["//", "/wp-admin", "/wordpress", "/.env", "/.git"];

// eslint-disable-next-line @typescript-eslint/require-await
export const handler: CloudFrontRequestHandler = async (event) => {
  const request = event.Records[0].cf.request;

  // Immediately return for probes
  if (probePrefixes.some((p) => request.uri.startsWith(p))) {
    return {
      status: "404",
      headers: {
        "cache-control": [{ value: "public, max-age=31536000" }],
      },
    } satisfies CloudFrontResultResponse;
  }

  // Calculate body hash for lambda auth
  // https://docs.aws.amazon.com/AmazonCloudFront/latest/DeveloperGuide/private-content-restricting-access-to-lambda.html#create-oac-overview-lambda
  if (!request.body?.data) return request;
  if (request.body.inputTruncated) {
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
