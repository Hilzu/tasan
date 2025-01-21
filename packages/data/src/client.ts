import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

export const dynamoClient = new DynamoDBClient();

export const documentClient = DynamoDBDocumentClient.from(dynamoClient);
