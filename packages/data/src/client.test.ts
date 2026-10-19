import assert from "node:assert/strict";
import { test } from "node:test";

import { cognitoMappingClient, documentClient } from "./client.js";

await test("identity operations use their configured authority while ordinary data stays local", async () => {
  const originalRegion = process.env.AWS_REGION;
  const originalMappingRegion = process.env.COGNITO_MAPPING_REGION;
  try {
    process.env.AWS_REGION = "ap-southeast-1";
    delete process.env.COGNITO_MAPPING_REGION;
    assert.equal(cognitoMappingClient(), documentClient());
    process.env.COGNITO_MAPPING_REGION = "eu-central-1";
    const authority = cognitoMappingClient();
    assert.notEqual(authority, documentClient());
    assert.equal(await authority.config.region(), "eu-central-1");
    assert.equal(await documentClient().config.region(), "ap-southeast-1");
    assert.equal(cognitoMappingClient(), authority);
  } finally {
    if (originalRegion === undefined) delete process.env.AWS_REGION;
    else process.env.AWS_REGION = originalRegion;
    if (originalMappingRegion === undefined)
      delete process.env.COGNITO_MAPPING_REGION;
    else process.env.COGNITO_MAPPING_REGION = originalMappingRegion;
  }
});
