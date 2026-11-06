import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CloudFrontRequest,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  Context,
} from "aws-lambda";

import { handler } from "./app-origin-request/main.mjs";

const context = {
  awsRequestId: "test-request",
  functionName: "AppOriginRequestFn",
  functionVersion: "1",
  invokedFunctionArn:
    "arn:aws:lambda:us-east-1:123456789012:function:AppOriginRequestFn:1",
  memoryLimitInMB: "256",
} as Context;

const originRequest = async (
  uri: string,
  querystring = "",
): Promise<CloudFrontRequestResult> => {
  const request: CloudFrontRequest = {
    clientIp: "192.0.2.1",
    method: "GET",
    uri,
    querystring,
    headers: { host: [{ key: "Host", value: "tasan.app" }] },
  };
  const event = {
    Records: [{ cf: { config: {}, request } }],
  } as unknown as CloudFrontRequestEvent;
  const result = await handler(event, context, () => undefined);
  return result ?? undefined;
};

const isRejected = (result: CloudFrontRequestResult) =>
  !!result && "status" in result && result.status === "404";

await test("paths the function URL would normalize are answered at the edge", async () => {
  for (const uri of [
    "/a//b",
    "/splits//",
    "/.",
    "/x/.",
    "/x/..",
    "/splits/./x",
    "/assets/../login",
  ]) {
    assert.ok(isRejected(await originRequest(uri)), uri);
  }
});

await test("normalized paths reach the origin unchanged", async () => {
  for (const uri of [
    "/",
    "/splits",
    "/splits/",
    "/splits/spl_01m4a1eph5yjscvtga2vhwas09",
    "/.well-known/x",
    "/x./y",
    "/.../y",
    "/%2e/y",
  ]) {
    const result = await originRequest(uri, "a=/../b");
    assert.ok(result && "uri" in result, uri);
    assert.equal(result.uri, uri);
    assert.equal(result.querystring, "a=/../b");
  }
});
