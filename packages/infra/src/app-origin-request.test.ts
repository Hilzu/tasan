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
  options: {
    region?: string;
    headers?: CloudFrontRequest["headers"];
  } = {},
): Promise<CloudFrontRequestResult> => {
  const previousRegion = process.env.AWS_REGION;
  if (options.region) process.env.AWS_REGION = options.region;
  const request: CloudFrontRequest = {
    clientIp: "192.0.2.1",
    method,
    uri,
    querystring,
    headers: {
      host: [{ key: "Host", value: "tasan.app" }],
      ...options.headers,
    },
  };
  const event = {
    Records: [{ cf: { config: {}, request } }],
  } as unknown as CloudFrontRequestEvent;
  try {
    const result = await handler(event, context, () => undefined);
    return result ?? undefined;
  } finally {
    if (previousRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = previousRegion;
  }
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

await test("Ohio edge regions route to the Ohio function URL", async () => {
  const domain = "dxkosp5vqfwxmwcs7a2te5gzgy0shdnq.lambda-url.us-east-2.on.aws";
  for (const region of [
    "us-east-1",
    "us-east-2",
    "us-west-1",
    "us-west-2",
    "sa-east-1",
  ]) {
    const result = await originRequest("/splits", "", "GET", { region });
    assert.ok(result && "uri" in result, region);
    assert.equal(result.origin?.custom?.domainName, domain, region);
    assert.deepEqual(result.headers.host, [{ value: domain }], region);
  }
});

await test("x-force-region selects a supported origin and ignores unknown regions", async () => {
  const ohioDomain =
    "dxkosp5vqfwxmwcs7a2te5gzgy0shdnq.lambda-url.us-east-2.on.aws";
  const singaporeDomain =
    "cxh43kp2vsbbrb4vgwpratjkpi0ekjjk.lambda-url.ap-southeast-1.on.aws";
  const headers = (region: string) => ({
    "x-force-region": [{ key: "X-Force-Region", value: region }],
  });

  const ohio = await originRequest("/splits", "", "GET", {
    region: "eu-central-1",
    headers: headers("us-east-2"),
  });
  assert.ok(ohio && "uri" in ohio);
  assert.equal(ohio.origin?.custom?.domainName, ohioDomain);

  const singapore = await originRequest("/splits", "", "GET", {
    region: "us-east-2",
    headers: headers("ap-southeast-2"),
  });
  assert.ok(singapore && "uri" in singapore);
  assert.equal(singapore.origin?.custom?.domainName, singaporeDomain);

  const defaultOrigin = await originRequest("/splits", "", "GET", {
    region: "us-east-2",
    headers: headers("eu-central-1"),
  });
  assert.ok(defaultOrigin && "uri" in defaultOrigin);
  assert.equal(defaultOrigin.origin, undefined);
  assert.deepEqual(defaultOrigin.headers.host, [
    { key: "Host", value: "tasan.app" },
  ]);

  const unknown = await originRequest("/splits", "", "GET", {
    region: "us-east-2",
    headers: headers("unknown-region"),
  });
  assert.ok(unknown && "uri" in unknown);
  assert.equal(unknown.origin?.custom?.domainName, ohioDomain);
});

await test("unrouted edge regions keep the default origin", async () => {
  const result = await originRequest("/splits", "", "GET", {
    region: "eu-central-1",
  });
  assert.ok(result && "uri" in result);
  assert.equal(result.origin, undefined);
  assert.deepEqual(result.headers.host, [{ key: "Host", value: "tasan.app" }]);
});
