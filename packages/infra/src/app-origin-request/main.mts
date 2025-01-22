import { createHash } from "node:crypto";

import type {
  CloudFrontRequestHandler,
  CloudFrontResultResponse,
} from "aws-lambda";

// eslint-disable-next-line @typescript-eslint/require-await
export const handler: CloudFrontRequestHandler = async (event) => {
  const request = event.Records[0].cf.request;
  if (!request.body?.data) return request;
  if (request.body.inputTruncated) {
    return {
      body: "Request body too large",
      bodyEncoding: "text",
      status: "413",
    } satisfies CloudFrontResultResponse;
  }

  const encoding = request.body.encoding === "base64" ? "base64" : "utf8";
  const hash = createHash("sha256");
  hash.update(request.body.data, encoding);
  const digest = hash.digest("hex");

  request.headers["x-amz-content-sha256"] = [
    { key: "x-amz-content-sha256", value: digest },
  ];

  return request;
};
