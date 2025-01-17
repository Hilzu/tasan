import type {
  LambdaFunctionURLHandler,
  LambdaFunctionURLEvent,
  APIGatewayProxyStructuredResultV2,
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

  const response = await requestHandler(request);

  return await responseToResult(response);
};
