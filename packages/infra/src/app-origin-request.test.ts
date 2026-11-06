import assert from "node:assert/strict";
import { test } from "node:test";

import type {
  CloudFrontRequest,
  CloudFrontRequestEvent,
  CloudFrontRequestResult,
  Context,
} from "aws-lambda";

import { handler, redactPath } from "./app-origin-request/main.mjs";

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
  method = "GET",
): Promise<CloudFrontRequestResult> => {
  const request: CloudFrontRequest = {
    clientIp: "192.0.2.1",
    method,
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

await test("paths the function URL would normalize are redirected to the normalized path", async () => {
  for (const [uri, location] of [
    ["/a//b", "/a/b"],
    ["//splits", "/splits"],
    ["/splits//", "/splits/"],
    ["/.", "/"],
    ["/x/.", "/x"],
    ["/x/..", "/"],
    ["/splits/./x", "/splits/x"],
    ["/assets/../login", "/login"],
    ["/a/../../b", "/b"],
  ]) {
    const result = await originRequest(uri);
    assert.ok(result && "status" in result, uri);
    assert.equal(result.status, "308", uri);
    assert.deepEqual(result.headers?.location, [{ value: location }], uri);
  }
});

await test("logged paths never contain an invite ID, even in non-normalized forms", () => {
  for (const uri of [
    "/accept-invite/inv_secret",
    "/accept-invite//inv_secret",
    "/accept-invite/./inv_secret",
    "/accept-invite/inv_secret/..",
    "/x/../accept-invite/inv_secret",
  ]) {
    const redacted = redactPath(uri);
    assert.ok(!redacted.includes("inv_secret"), redacted);
    assert.ok(redacted.endsWith("/accept-invite/[redacted]"), redacted);
  }
  assert.equal(redactPath("/splits/spl_1"), "/splits/spl_1");
});

await test("redirects keep the query string, and a POST keeps its method", async () => {
  const result = await originRequest("/splits//x", "a=1&b=/../c", "POST");
  assert.ok(result && "status" in result);
  assert.equal(result.status, "308");
  assert.deepEqual(result.headers?.location, [
    { value: "/splits/x?a=1&b=/../c" },
  ]);
});

await test("unsupported methods are answered at the edge with 405 and the supported methods", async () => {
  for (const method of ["DELETE", "PUT", "PATCH", "OPTIONS"]) {
    const result = await originRequest("/splits", "", method);
    assert.ok(result && "status" in result, method);
    assert.equal(result.status, "405", method);
    assert.deepEqual(result.headers?.allow, [{ value: "GET, HEAD, POST" }]);
  }
});

await test("GET, HEAD, and POST reach the origin", async () => {
  for (const method of ["GET", "HEAD", "POST"]) {
    const result = await originRequest("/splits", "", method);
    assert.ok(result && "uri" in result, method);
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
