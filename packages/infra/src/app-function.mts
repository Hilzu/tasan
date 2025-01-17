import type {
  APIGatewayProxyStructuredResultV2,
  LambdaFunctionURLEvent,
  LambdaFunctionURLHandler,
} from "aws-lambda";
import { createRequestHandler } from "react-router";
import * as process from "node:process";
import * as build from "@tasan/web";

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
  return new Request(url, {
    body: event.body,
    headers,
    method: event.requestContext.http.method,
  });
};

const responseToResult = async (
  response: Response,
): Promise<APIGatewayProxyStructuredResultV2> => {
  const body = await response.text();
  return {
    statusCode: response.status,
    headers: Object.fromEntries(response.headers),
    body,
    isBase64Encoded: false,
    cookies: undefined,
  };
};

export const handler: LambdaFunctionURLHandler = async (event) => {
  const request = eventToRequest(event);
  console.log("Received request", {
    method: request.method,
    url: request.url,
    headers: {
      "cloudfront-viewer-country-name": request.headers.get(
        "cloudfront-viewer-country-name",
      ),
      accept: request.headers.get("accept"),
      "accept-encoding": request.headers.get("accept-encoding"),
      "accept-language": request.headers.get("accept-language"),
      "user-agent": request.headers.get("user-agent"),
      "x-forwarded-for": request.headers.get("x-forwarded-for"),
    },
  });

  const response = await requestHandler(request);
  console.log("Responding with", {
    status: response.status,
    headers: Object.fromEntries(response.headers),
  });

  return await responseToResult(response);
};
