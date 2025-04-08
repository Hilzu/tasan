import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import AWSXRay from "aws-xray-sdk-core";

let _dynamoClient: DynamoDBClient | undefined;
export const dynamoClient = () => {
  _dynamoClient ??= AWSXRay.captureAWSv3Client(new DynamoDBClient());
  return _dynamoClient;
};

let _documentClient: DynamoDBDocumentClient | undefined;
export const documentClient = () => {
  _documentClient ??= DynamoDBDocumentClient.from(dynamoClient());
  return _documentClient;
};
