import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import AWSXRay from "aws-xray-sdk-core";

export const dynamoClient = AWSXRay.captureAWSv3Client(new DynamoDBClient());

export const documentClient = DynamoDBDocumentClient.from(dynamoClient);
