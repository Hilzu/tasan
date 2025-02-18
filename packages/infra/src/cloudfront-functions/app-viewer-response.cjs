/**
 * @import {CloudFrontFunctionsEvent} from "aws-lambda";
 */

/**
 * @param {CloudFrontFunctionsEvent} event
 * @returns {*}
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
function handler(event) {
  const request = event.request;
  const response = event.response;

  response.headers["trace-e2e-time"] = {
    value: String(
      Date.now() - parseInt(request.headers["trace-start-time"].value),
    ),
  };

  return response;
}
