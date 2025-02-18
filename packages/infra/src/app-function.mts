import * as process from "node:process";

import * as build from "@tasan/web";
import type {
  APIGatewayProxyStructuredResultV2,
  LambdaFunctionURLEvent,
  LambdaFunctionURLHandler,
} from "aws-lambda";
import AWSXRay from "aws-xray-sdk-core";
import { createRequestHandler } from "react-router";

AWSXRay.enableAutomaticMode();

const requestHandler = createRequestHandler(build, process.env.NODE_ENV);

const eventToRequest = (event: LambdaFunctionURLEvent): Request => {
  const url = new URL(
    event.rawPath,
    `https://${event.requestContext.domainName}`,
  );
  url.search = event.rawQueryString;

  const headers = new Headers();
  for (const [key, value] of Object.entries(event.headers)) {
    if (!value) continue;
    headers.set(key, value);
  }

  let body: string | ArrayBuffer | undefined = event.body;
  if (event.isBase64Encoded) {
    const buffer = Buffer.from(event.body ?? "", "base64");
    const contentType = headers.get("content-type") ?? "";
    const charset = /charset=utf-8/i.test(contentType) ? "utf-8" : null;
    body = charset ? buffer.toString(charset) : buffer.buffer;
  }

  return new Request(url, {
    body,
    headers,
    method: event.requestContext.http.method,
  });
};

const textSubTypes = ["json", "xml"];
const shouldBase64Encode = (contentType: string | null): boolean => {
  if (!contentType) return false;
  const mediaType = contentType.split(";")[0].trim();
  const [type, subtype] = mediaType.split("/");
  if (type === "text") return false;
  if (textSubTypes.includes(subtype)) return false;

  const suffix = subtype.split("+")[1];
  if (textSubTypes.includes(suffix)) return false;

  return true;
};

const base64Encode = (buffer: ArrayBuffer): string => {
  return Buffer.from(buffer).toString("base64");
};

const responseToResult = async (
  response: Response,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const cookies = response.headers.getSetCookie();
  response.headers.delete("set-cookie");

  const contentType = response.headers.get("content-type");
  const isBase64Encoded = shouldBase64Encode(contentType);
  const body =
    isBase64Encoded ?
      base64Encode(await response.arrayBuffer())
    : await response.text();

  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body,
    isBase64Encoded,
    cookies,
  };
};

export const handler: LambdaFunctionURLHandler = async (event) => {
  const segment = AWSXRay.getSegment()?.addNewSubsegment("handler");
  console.log("segment", segment);
  segment?.addAnnotation("http.request.url", event.rawPath);
  segment?.addAnnotation(
    "http.request.method",
    event.requestContext.http.method,
  );
  segment?.addAnnotation(
    "http.request.user_agent",
    event.headers["user-agent"] ?? "",
  );
  segment?.addAnnotation(
    "http.request.client_ip",
    event.requestContext.http.sourceIp,
  );

  const request = eventToRequest(event);
  console.log("Received request", {
    method: request.method,
    url: request.url,
    headers: {
      accept: request.headers.get("accept"),
      "accept-encoding": request.headers.get("accept-encoding"),
      "accept-language": request.headers.get("accept-language"),
      "cloudfront-viewer-country-name": request.headers.get(
        "cloudfront-viewer-country-name",
      ),
      "content-length": request.headers.get("content-length"),
      "content-type": request.headers.get("content-type"),
      origin: request.headers.get("origin"),
      referer: request.headers.get("referer"),
      "user-agent": request.headers.get("user-agent"),
      "x-forwarded-for": request.headers.get("x-forwarded-for"),
    },
  });

  const response = await requestHandler(request);

  const result = await responseToResult(response);

  console.log("Responding with", {
    status: result.statusCode,
    headers: result.headers,
  });

  segment?.addAnnotation("http.response.status", response.status);
  segment?.addAnnotation(
    "http.response.content_type",
    response.headers.get("content-type") ?? "",
  );
  segment?.addAnnotation(
    "http.response.content_length",
    result.body?.length ?? 0,
  );
  segment?.close();
  return result;
};
