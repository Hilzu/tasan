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
  // const context = event.context;
  //
  // const requestIdHex = convertBase64ToHex(context.requestId);
  //
  // const version = "00";
  // const traceId = requestIdHex.slice(0, 32);
  // const parentId = requestIdHex.slice(32, 32 + 16);
  // const traceFlags = "01";
  // const traceparent = `${version}-${traceId}-${parentId}-${traceFlags}`;
  //
  // request.headers.traceparent = { value: traceparent };
  request.headers["trace-start-time"] = { value: Date.now().toString() };

  return request;
}

/**
 *
 * @param {string} base64EncodedText
 * @returns {string}
 */
// function convertBase64ToHex(base64EncodedText) {
//   return Buffer.from(base64EncodedText, "base64").toString("hex");
// }
